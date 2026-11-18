from __future__ import annotations
from datetime import datetime

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}

FILENAME_TERMS = (
    "assignment", "assign", "homework", "coursework",
    "assessment", "project",
)

LECTURE_TERMS = ("lecture", "slides", "presentation")

STRONG_ASSIGNMENT_PATTERNS = (
    r"\bcourse\s+assignment\b",
    r"\bassignment\s+title\b",
    r"\btotal\s+marks\b",
    r"\bsubmission\s+deadline\b",
    r"\bdetailed\s+marking\s+rubric\b",
    r"\bassignment\s+overview\b",
)


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        try:
            import pymupdf
            with pymupdf.open(path) as document:
                return "\n".join(page.get_text("text") for page in document)
        except ImportError:
            import fitz
            with fitz.open(path) as document:
                return "\n".join(page.get_text("text") for page in document)

    if suffix == ".docx":
        from docx import Document
        document = Document(path)
        parts = [p.text for p in document.paragraphs if p.text.strip()]

        for table in document.tables:
            for row in table.rows:
                parts.append(" | ".join(cell.text.strip() for cell in row.cells))

        return "\n".join(parts)

    if suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="replace")

    raise ValueError(f"Unsupported assignment file type: {suffix}")


def _fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _label_value(text: str, labels: str) -> Optional[str]:
    lines = text.splitlines()

    row_re = re.compile(
        rf"^\s*(?:{labels})\s*(?:\||:|-)\s*(.*?)\s*$",
        re.IGNORECASE,
    )
    label_re = re.compile(
        rf"^\s*(?:{labels})\s*$",
        re.IGNORECASE,
    )

    for index, line in enumerate(lines):
        match = row_re.match(line)
        if match and match.group(1).strip():
            return match.group(1).strip()

        if label_re.match(line):
            for next_line in lines[index + 1:]:
                value = next_line.strip()
                if value:
                    return value

    return None

def _extract_date_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    match = re.search(
        r"\b(\d{4}-\d{1,2}-\d{1,2}|"
        r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|"
        r"\d{1,2}\s+(?:January|February|March|April|May|June|July|August|"
        r"September|October|November|December)\s+\d{4}|"
        r"(?:January|February|March|April|May|June|July|August|"
        r"September|October|November|December)\s+\d{1,2},?\s+\d{4})\b",
        value,
        re.IGNORECASE,
    )
    if not match:
        return None

    raw = match.group(1).strip()
    formats = [
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y",
        "%d/%m/%y", "%d-%m-%y",
        "%d %B %Y", "%d %b %Y",
        "%B %d %Y", "%B %d, %Y",
        "%b %d %Y", "%b %d, %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def _extract_metadata(path: Path, text: str) -> Dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    title = path.stem.replace("_", " ").replace("-", " ").strip()

    explicit_title = _label_value(
        text, r"assignment\s+title|assessment\s+title|title"
    )

    if explicit_title:
        title = explicit_title
    else:
        for line in lines[:15]:
            cleaned = re.sub(r"\s+", " ", line).strip()
            if re.search(r"\bassignment\s+\d+\b", cleaned, re.IGNORECASE):
                title = cleaned
                break

    marks = None

    # Prefer explicitly labelled total marks, not individual rubric marks.
    total_value = _label_value(
        text,
        r"total\s+marks|maximum\s+marks|total\s+score|maximum\s+score",
    )

    if total_value:
        match = re.match(r"\s*(\d+(?:\.\d+)?)\b", total_value)
        if match:
            marks = float(match.group(1))
            if marks.is_integer():
                marks = int(marks)

    # Fallback only when there is no explicit total-marks label.
    if marks is None:
        match = re.search(
            r"\btotal\s+(?:of\s+)?(\d+(?:\.\d+)?)\s+marks\b",
            text,
            re.IGNORECASE,
        )
        if match:
            marks = float(match.group(1))
            if marks.is_integer():
                marks = int(marks)

    clo_matches = re.findall(
        r"\bCLO\s*[-_ ]?(\d+)\b", text, re.IGNORECASE
    )
    clos = list(dict.fromkeys(f"CLO{number}" for number in clo_matches))

    start_value = _label_value(
        text,
        r"allow\s+submissions\s+from|start\s*/\s*issue\s+date|issue\s+date|start\s+date|available\s+from|issued\s+on",
    )
    due_value = _label_value(
        text,
        r"end\s*/\s*submission\s+deadline|submission\s+deadline|"
        r"due\s+date|deadline|submit\s+by",
    )

    start_date = _extract_date_value(start_value)
    due_date = _extract_date_value(due_value)

    # Also support sentence-style date labels.
    if not start_date:
        match = re.search(
            r"(?:allow\s+submissions\s+from|start\s+date|issued\s+on|issue\s+date)\s*[:\-]?\s*"
            r"(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})",
            text, re.IGNORECASE,
        )
        start_date = match.group(1) if match else None

    if not due_date:
        match = re.search(
            r"(?:submit\s+by|submission\s+deadline|due\s+date|deadline)"
            r"\s*[:\-]?\s*"
            r"(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})",
            text, re.IGNORECASE,
        )
        due_date = match.group(1) if match else None

    week_numbers = list(dict.fromkeys(
        int(number) for number in re.findall(
            r"\bWeek\s*[:\-]?\s*(\d+)\b", text, re.IGNORECASE
        )
    ))

    rubric = []
    for line in lines:
        if re.search(
            r"\b(rubric|criteria|criterion|grading|evaluation)\b",
            line, re.IGNORECASE,
        ):
            rubric.append(line)

    instruction_lines = []
    capture = False
    for line in lines:
        if re.search(r"\b(instructions|requirements)\b", line, re.IGNORECASE):
            capture = True
        if capture:
            instruction_lines.append(line)
            if len(instruction_lines) >= 12:
                break
        # Build a concise LMS assignment description.
    description = (
        f"{title}\n\n"
        f"Total Marks: {marks if marks is not None else 'Not specified'}\n\n"
        f"Mapped CLO: {', '.join(clos) if clos else 'Not specified'}"
    )


    return {
        "title": title,
        "start_date": start_date,
        "due_date": due_date,
        "total_marks": marks,
        "clos": clos,
        "rubric_notes": rubric[:30],
        "instructions": "\n".join(instruction_lines),
        "description": description,
        "week_numbers": week_numbers,
        "week_number": week_numbers[0] if len(week_numbers) == 1 else None,
    }


def inspect_assignment_file(path: Path) -> Dict[str, Any]:
    path = Path(path).resolve()

    if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError("File is not a supported assignment document.")

    text = _extract_text(path)
    filename = path.stem.lower()

    filename_match = any(term in filename for term in FILENAME_TERMS)
    lecture_filename = any(term in filename for term in LECTURE_TERMS)

    strong_hits = sum(
        1 for pattern in STRONG_ASSIGNMENT_PATTERNS
        if re.search(pattern, text, re.IGNORECASE)
    )

    # A lecture filename is excluded unless its filename explicitly
    # identifies it as an assignment too.
    is_candidate = (
        (filename_match and (not lecture_filename or "assignment" in filename))
        or (not lecture_filename and strong_hits >= 2)
    )

    confidence = min(
        0.99,
        (0.65 if filename_match else 0.0)
        + min(strong_hits * 0.12, 0.30),
    )

    metadata = _extract_metadata(path, text)

    return {
        "file_name": path.name,
        "file_path": str(path),
        "file_size": path.stat().st_size,
        "fingerprint": _fingerprint(path),
        "is_assignment_candidate": is_candidate,
        "confidence": round(confidence, 2),
        "extraction_status": "text_extracted" if text.strip() else "no_text_found",
        "warnings": [],
        **metadata,
    }


def scan_course_assignment_files(folder: str) -> List[Dict[str, Any]]:
    """Search only inside the explicitly saved course folder."""
    root = Path(folder).expanduser().resolve()

    if not root.is_dir():
        raise FileNotFoundError(f"Saved course folder does not exist: {root}")

    results = []

    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        try:
            result = inspect_assignment_file(path)
            if result["is_assignment_candidate"]:
                results.append(result)
        except Exception as exc:
            results.append({
                "file_name": path.name,
                "file_path": str(path),
                "is_assignment_candidate": False,
                "extraction_status": "failed",
                "warnings": [str(exc)],
            })

    return sorted(
        results,
        key=lambda item: item.get("confidence", 0),
        reverse=True,
    )
