"""
MUAWIN AI add-on  (Gemini Flash-Lite + CLO mapping + upload-day pattern)

This file ADDS behaviour to your existing code at start-up. It does not edit
muawin_lecture.py, muawin_combined.py, assignment_workflow.py or server.py.
Run the API with  backend.server_ai:app  instead of  backend.server:app.

What it does
1. Lecture draft   : Gemini writes a short description + key points from the
                     lecture file (only when you did not write them yourself).
2. Assignments     : Gemini writes the questions (same types / marks as the
                     request). If Gemini fails, your rule-based generator runs.
3. CLO mapping     : every lecture and assignment is mapped to the CLOs of the
                     course outline. The outline the teacher uploaded for that
                     course (saved in the database) is used first; the old
                     backend/outlines/ folder and clo_outlines.json are only a
                     fallback. Gemini checks the content and flags disagreement.
4. Upload day      : the weekday of every upload is stored in local SQLite. When a
                     usual day is known and today matches, nothing is asked.
                     Otherwise the review screen shows a question first
                     (draft["upload_confirmation"]).
5. Outline upload  : preview_outline_bytes() reads a .docx or .pdf outline and
                     save_outline_for_teacher() stores it (used by the
                     endpoints in server_ai.py).

.env (backend/.env):
    GEMINI_API_KEY=...                   (already used by live transcription)
    GEMINI_TEXT_MODEL=gemini-3.5-flash-lite   (optional)
    MUAWIN_LLM_QUESTIONS=1               (0 = keep rule-based questions)
    MUAWIN_OUTLINE_FALLBACK=0            (0 = never borrow another course's
                                          outline; set this once the website
                                          is used by more than one teacher)
"""

from __future__ import annotations

import json
import os
import re
import math
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:  # dotenv missing: real environment variables still work
    pass

from . import assignment_workflow as asg
from . import muawin_lecture as lec

HERE = Path(__file__).resolve().parent
OUTLINES_FILE = HERE / "clo_outlines.json"

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
MAX_SOURCE_CHARS = 9000  # lecture text sent to Gemini


def _model() -> str:
    return os.getenv("GEMINI_TEXT_MODEL", "gemini-3.5-flash-lite")


def llm_ready() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


# ============================================================
# GEMINI (plain REST, no extra package)
# ============================================================
def gemini_json(prompt: str, system: str, timeout: int = 45) -> Optional[Any]:
    """Ask Gemini for JSON. Returns the parsed JSON, or None on any failure."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None

    body = json.dumps({
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        GEMINI_URL.format(model=_model()),
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )

    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
            return json.loads(text)
        except urllib.error.HTTPError as exc:
            print(f"[AI] Gemini HTTP {exc.code} (attempt {attempt})")
            if exc.code not in (429, 500, 502, 503, 504):
                return None
        except Exception as exc:
            print(f"[AI] Gemini call failed (attempt {attempt}): {exc}")
        time.sleep(1.5)
    return None


# ============================================================
# CLO OUTLINES
#   * The outline a teacher uploads for a course is saved in the database
#     (ai_course_outline) and is used first.
#   * Fallback (old way): put the course outline (.docx) in backend/outlines/
#     -> it is read automatically (restart not needed; changed files are
#     re-read). clo_outlines.json is only the built-in sample.
# ============================================================
OUTLINES_DIR = HERE / "outlines"
OUTLINES_DIR.mkdir(exist_ok=True)

_json_cache: Optional[Dict[str, Any]] = None
_docx_cache: Dict[str, Any] = {}  # path -> (mtime, outline or None)

_STOP = {"the", "of", "and", "to", "in", "for", "a", "an", "female", "male",
         "f", "m", "lab", "course", "outline", "section"}


def _title_tokens(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9]+(?:-[0-9]+)?", (text or "").lower())
            if t not in _STOP]


def _token_match(a: str, b: str) -> bool:
    if a == b:
        return True
    # "intro" ~ "introduction"
    return len(a) >= 5 and len(b) >= 5 and a[:5] == b[:5]


def _shared_tokens(a: str, b: str) -> int:
    bt = _title_tokens(b)
    return sum(1 for t in set(_title_tokens(a)) if any(_token_match(t, u) for u in bt))



def parse_outline_docx(path: Path) -> Optional[Dict[str, Any]]:
    'Reads CLOs and weekly mappings from DOCX tables or paragraphs.'
    try:
        from docx import Document
    except ImportError:
        print("[AI] python-docx is missing. Run: python -m pip install python-docx")
        return None

    try:
        doc = Document(str(path))
    except Exception as exc:
        print(f"[AI] Could not open outline {path.name}: {exc}")
        return None

    def cells(row):
        out, last = [], None
        for c in row.cells:
            if c._tc is not last:
                out.append(c.text.strip())
                last = c._tc
        return out

    title, clos, weeks = "", {}, {}

    def add_docx_clo(label, body, bloom=""):
        match = re.search(r"CLO\s*[-??]?\s*(\d+)", label or "", re.I)
        if match:
            _add_clo(clos, f"CLO{match.group(1)}", body or "", bloom)

    # First read tables, retaining support for the existing table layout.
    for table in doc.tables:
        for row in table.rows:
            cs = cells(row)
            if not cs:
                continue

            if len(cs) >= 2 and cs[0].lower().startswith("course title"):
                title = cs[1]

            # Older layout: CLO definition stored in the third cell.
            if len(cs) >= 4:
                old_match = re.match(
                    r"(CLO\s*\d+)\s*[:.\-??]\s*(.*)", cs[2], re.S | re.I
                )
                if old_match:
                    add_docx_clo(old_match.group(1), old_match.group(2), cs[1])

            # General layouts: CLO ID and outcome may be in separate cells.
            for i, cell in enumerate(cs):
                match = re.match(
                    r"^\s*(CLO\s*[-??]?\s*\d+)\s*(?:(?::|[??]|-|\.)\s*)?(.*)$",
                    cell, re.S | re.I
                )
                if not match:
                    continue

                body = (match.group(2) or "").strip()
                if not body and i + 1 < len(cs):
                    body = cs[i + 1].strip()
                if body:
                    add_docx_clo(match.group(1), body)

            # Weekly topic and mapped CLO table.
            if (len(cs) >= 3 and re.fullmatch(r"\d{1,2}", cs[0])
                    and "CLO" in cs[-1].upper()):
                mapped = re.sub(
                    r"CLO\s*[-??]\s*(\d+)", r"CLO\1", cs[-1], flags=re.I
                )
                lines = [
                    re.sub(r"^[\s\u2022\-??]+", "",
                           re.sub(r"\s+", " ", ln)).strip()
                    for ln in cs[1].split("\n")
                ]
                lines = [ln for ln in lines if ln]
                if lines:
                    weeks[str(int(cs[0]))] = {
                        "lines": lines,
                        "topic": cs[1].split("\n")[0][:160],
                        "raw_clo": cs[-1],
                        "clos": _clo_ids(mapped),
                    }

    # Read paragraph-based CLO definitions as well.
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    if not title:
        for para in paragraphs:
            if para.upper() not in ("COURSE OUTLINE", "COURSE INFORMATION"):
                title = para
                break

    clo_pattern = re.compile(
        r"^\s*(CLO\s*[-??]?\s*\d+)\s*(?::|[??]|-(?=\s)|\.)?\s*(.*?)\s*$",
        re.I
    )

    for i, para in enumerate(paragraphs):
        match = clo_pattern.match(para)
        if match:
            body = (match.group(2) or "").strip()

            # A short CLO heading may have its explanation in the next paragraph.
            if len(body) < 100 and i + 1 < len(paragraphs):
                following = paragraphs[i + 1]
                is_next_item = (
                    clo_pattern.match(following)
                    or re.match(r"^(?:week\s*)?\d{1,2}\b", following, re.I)
                    or re.match(r"^\d{1,2}\.\s+", following)
                )
                if not is_next_item:
                    body = (body + " " + following).strip()

            add_docx_clo(match.group(1), body)

        # Also retain simple paragraph-based weekly mappings.
        week_match = _WEEK_LINE.match(para)
        if week_match:
            _add_week(
                weeks, week_match.group(1),
                week_match.group(2), week_match.group(3)
            )

    if not clos:
        print(f"[AI] Outline {path.name}: no CLOs found.")
        return None

    return {
        "title": title or path.stem,
        "clos": clos,
        "weeks": weeks,
        "source": path.name,
    }


_CLO_DEF = re.compile(r"^\s*(CLO\s*\d+)\s*[:.\-Ã¢â‚¬â€œ]\s*(.+)", re.S | re.I)
_WEEK_LINE = re.compile(
    r"^\s*(?:week\s*)?(\d{1,2})\s*[:.\-Ã¢â‚¬â€œ|]?\s+(.+?)\s+"
    r"((?:CLO\s*\d+(?:\s*[,&/;]\s*(?:CLO\s*)?\d+)*)\s*)$", re.I)


def _add_clo(clos: Dict[str, Any], label: str, text: str, bloom: str = "") -> None:
    key = re.sub(r"\s+", "", label).upper()
    text = re.sub(r"\s+", " ", text).strip()
    if key not in clos and len(text) > 3:
        clos[key] = {"text": text, "bloom": bloom}


def _clo_ids(text: str) -> List[str]:
    """'CLO3, CLO4' / 'CLO 3, 4' / 'CLO1 & 2' -> ['CLO3', 'CLO4']."""
    ids: List[str] = []
    for grp in re.finditer(r"CLO\s*\d+(?:\s*(?:[,&/;]|and)\s*(?:CLO\s*)?\d+)*", text or "", re.I):
        for n in re.findall(r"\d+", grp.group(0)):
            if f"CLO{n}" not in ids:
                ids.append(f"CLO{n}")
    return ids


def _add_week(weeks: Dict[str, Any], num: str, topic_text: str, clo_text: str) -> None:
    ids = _clo_ids(clo_text)
    lines = [re.sub(r"^[\s\u2022\-\u2013\u00b7]+", "", re.sub(r"\s+", " ", ln)).strip()
             for ln in topic_text.split("\n")]
    lines = [ln for ln in lines if ln]
    if not lines or not ids:
        return
    weeks.setdefault(str(int(num)), {
        "lines": lines, "topic": lines[0][:160],
        "raw_clo": clo_text.strip(), "clos": ids})


def parse_outline_pdf(path: Path) -> Optional[Dict[str, Any]]:
    """Reads an outline PDF: CLO definitions and the week -> CLO plan.
    Best effort: tables first, then plain text lines. The teacher should
    check the preview (warnings list what could not be read)."""
    try:
        import pdfplumber
    except ImportError:
        print("[AI] pdfplumber is missing. Run: python -m pip install pdfplumber")
        return None
    clos: Dict[str, Any] = {}
    weeks: Dict[str, Any] = {}
    title, all_text = "", []
    try:
        with pdfplumber.open(str(path)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                all_text.append(text)
                for table in page.extract_tables() or []:
                    for row in table:
                        cs = [(c or "").strip() for c in row]
                        cs = [c for c in cs if c != ""]
                        if len(cs) < 2:
                            continue
                        if cs[0].lower().startswith("course title"):
                            title = cs[1]
                        is_clo_row = False
                        for i, c in enumerate(cs):
                            m = _CLO_DEF.match(c)
                            if m:
                                is_clo_row = True
                                bloom = cs[i + 1] if i + 1 < len(cs) and len(cs[i + 1]) < 30 else ""
                                _add_clo(clos, m.group(1), m.group(2), bloom)
                            elif re.fullmatch(r"CLO\s*\d+", c, re.I) and i + 1 < len(cs) \
                                    and len(cs[i + 1]) > 15 and not re.fullmatch(r"\d{1,2}", cs[0]):
                                is_clo_row = True
                                _add_clo(clos, c, cs[i + 1])
                        week_m = re.fullmatch(r"(?:week\s*)?(\d{1,2})", cs[0], re.I)
                        if (week_m and not is_clo_row and "CLO" in cs[-1].upper()
                                and len(cs) >= 3):
                            _add_week(weeks, week_m.group(1), cs[1], cs[-1])
    except Exception as exc:
        print(f"[AI] Could not read outline PDF {path.name}: {exc}")
        return None

    # Plain-text fallback / supplement (CLOs written as paragraphs, week rows
    # written as lines).
    text = "\n".join(all_text)
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    for i, ln in enumerate(lines):
        m = _CLO_DEF.match(ln)
        if m and not weeks.get(m.group(1)):
            body = m.group(2)
            # wrapped text continues on the following lines until the next item
            j = i + 1
            while j < len(lines) and not _CLO_DEF.match(lines[j]) \
                    and not re.match(r"^(week\s*)?\d{1,2}\b", lines[j], re.I) \
                    and len(body) < 400:
                body += " " + lines[j]
                j += 1
            _add_clo(clos, m.group(1), body)
        w = _WEEK_LINE.match(ln)
        if w:
            _add_week(weeks, w.group(1), w.group(2), w.group(3))
    if not title and lines:
        title = lines[0]
    if not clos:
        print(f"[AI] Outline {path.name}: no CLOs found in the PDF.")
        return None
    return {"title": title or path.stem, "clos": clos, "weeks": weeks,
            "source": path.name}


def load_outlines() -> List[Dict[str, Any]]:
    """Uploaded .docx outlines first, then the built-in JSON sample."""
    global _json_cache
    found: List[Dict[str, Any]] = []

    for path in sorted(OUTLINES_DIR.glob("*.docx")):
        if path.name.startswith("~$"):
            continue
        mtime = path.stat().st_mtime
        cached = _docx_cache.get(str(path))
        if not cached or cached[0] != mtime:
            outline = parse_outline_docx(path)
            _docx_cache[str(path)] = (mtime, outline)
            if outline:
                print(f"[AI] Outline loaded: {path.name} "
                      f"({len(outline['clos'])} CLOs, {len(outline['weeks'])} weeks)")
        outline = _docx_cache[str(path)][1]
        if outline:
            found.append(outline)

    if found:  # the teacher's own outline(s) replace the built-in sample
        return found

    if _json_cache is None:
        try:
            raw = json.loads(OUTLINES_FILE.read_text(encoding="utf-8"))
            _json_cache = list(raw.values())
        except Exception:
            _json_cache = []
    found.extend(_json_cache)
    return found


def _plain_course_key(course: Optional[str]) -> str:
    """'CS7 MUAWIN (Female)' and 'cs7 muawin' are the same course."""
    text = re.sub(r"\s*\([^)]*\)\s*$", "", course or "")
    return re.sub(r"\s+", " ", text).strip().lower()


def _json_outlines() -> Dict[str, Any]:
    try:
        raw = json.loads(OUTLINES_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _mapped_outline(course: str) -> Optional[Dict[str, Any]]:
    """
    outlines/course_map.json says which outline belongs to which course:

        { "CS7 MUAWIN (Female)": "intro_marketing" }

    The value is the name of an outline .docx in the outlines/ folder, the
    outline's title, or the key of an entry in clo_outlines.json.
    """
    path = OUTLINES_DIR / "course_map.json"
    if not path.exists():
        return None
    try:
        mapping = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[AI] course_map.json could not be read: {exc}")
        return None
    if not isinstance(mapping, dict):
        return None

    want = None
    for name, target in mapping.items():
        if _plain_course_key(name) == _plain_course_key(course):
            want = str(target).strip()
            break
    if not want:
        return None
    wl = want.lower()

    for outline in load_outlines():
        if wl in (str(outline.get("source", "")).lower(),
                  str(outline.get("title", "")).lower()):
            return outline
    for key, outline in _json_outlines().items():
        if wl in (key.lower(), str(outline.get("title", "")).lower()):
            return outline
    print(f"[AI] course_map.json: outline '{want}' for '{course}' was not found "
          "(check the name, it must be a .docx in outlines/ or a key of "
          "clo_outlines.json).")
    return None


UPLOADED_DIR = OUTLINES_DIR / "uploaded"


def _safe_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")[:80]


def _uploaded_file(teacher: str, course: str) -> Path:
    return UPLOADED_DIR / f"{_safe_name(teacher)}__{_safe_name(_plain_course_key(course))}.json"


def _load_uploaded_outline(teacher: str, course: str) -> Optional[Dict[str, Any]]:
    """Outline the teacher uploaded, kept as a file (used when the database
    is not running, so the upload still works)."""
    path = _uploaded_file(teacher, course)
    try:
        if path.exists():
            return clean_outline(json.loads(path.read_text(encoding="utf-8")))
    except Exception as exc:
        print(f"[AI] Could not read uploaded outline {path.name}: {exc}")
    return None


def _save_uploaded_outline(teacher: str, course: str, outline: Dict[str, Any]) -> bool:
    try:
        UPLOADED_DIR.mkdir(parents=True, exist_ok=True)
        _uploaded_file(teacher, course).write_text(
            json.dumps({**outline, "course": course}, ensure_ascii=False, indent=1),
            encoding="utf-8")
        return True
    except Exception as exc:
        print(f"[AI] Could not write the outline file: {exc}")
        return False


def find_outline(course: str, teacher: str = "") -> Optional[Dict[str, Any]]:
    # 1) The outline this teacher uploaded for exactly this course
    #    (database first, then the saved file).
    if teacher:
        try:
            from . import ai_db
            saved = ai_db.get_outline(teacher, course)
        except Exception as exc:
            print(f"[AI] Could not read the saved outline: {exc}")
            saved = None
        if saved:
            return {**saved, "assumed": False}
        uploaded = _load_uploaded_outline(teacher, course)
        if uploaded:
            return {**uploaded, "assumed": False}

        # Authenticated teacher workflows must never borrow another course's outline.
        return None

    # 2) outlines/course_map.json: this course is tied to a named outline.
    mapped = _mapped_outline(course)
    if mapped:
        return {**mapped, "assumed": False}

    # 3) Old way: outlines/ folder and clo_outlines.json.
    outlines = load_outlines()
    best, best_score = None, 0
    for outline in outlines:
        score = _shared_tokens(course, outline.get("title", ""))
        if score > best_score:
            best, best_score = outline, score
    if best and best_score >= 2:
        return {**best, "assumed": False}
    # No title match: only one outline available -> use it, but flag it.
    if len(outlines) == 1 and os.getenv("MUAWIN_OUTLINE_FALLBACK", "1") != "0":
        return {**outlines[0], "assumed": True}
    return None


def _norm_clos(values) -> List[str]:
    out: List[str] = []
    for v in values or []:
        m = re.search(r"CLO\s*(\d+)", str(v), re.I)
        if m and f"CLO{m.group(1)}" not in out:
            out.append(f"CLO{m.group(1)}")
    return out


def fmt_clo(clo_id: str) -> str:
    """'CLO1' -> 'CLO 1' (the way it is written on Moellim)."""
    return re.sub(r"^CLO\s*(\d+)$", r"CLO \1", clo_id)


# ============================================================
# OUTLINE UPLOAD (preview -> teacher checks -> save to database)
# ============================================================
def outline_warnings(outline: Dict[str, Any]) -> List[str]:
    """Things the teacher should look at before confirming a parsed outline."""
    warnings: List[str] = []
    clos = outline.get("clos") or {}
    weeks = outline.get("weeks") or {}
    if not weeks:
        warnings.append("No week-wise table was found, so lectures cannot be "
                        "matched to CLOs.")
        return warnings
    for n, row in sorted(weeks.items(), key=lambda kv: int(kv[0])):
        ids = _norm_clos(row.get("clos"))
        if not ids:
            warnings.append(f"Week {n} has no CLO.")
            continue
        undefined = [c for c in ids if c not in clos]
        if undefined:
            warnings.append(f"Week {n} lists {', '.join(undefined)} but the "
                            "outline does not define it.")
    return warnings


def clean_outline(obj: Any) -> Optional[Dict[str, Any]]:
    """Checks an outline sent back by the website and returns a clean copy
    (None when it has no CLOs)."""
    if not isinstance(obj, dict):
        return None
    clos_in, weeks_in = obj.get("clos"), obj.get("weeks")
    if not isinstance(clos_in, dict):
        return None

    clos: Dict[str, Any] = {}
    for key, val in clos_in.items():
        ids = _norm_clos([key])
        if not ids or not isinstance(val, dict):
            continue
        clos[ids[0]] = {"text": str(val.get("text", ""))[:1000],
                        "bloom": str(val.get("bloom", ""))[:100]}
    if not clos:
        return None

    weeks: Dict[str, Any] = {}
    for key, val in (weeks_in if isinstance(weeks_in, dict) else {}).items():
        if not str(key).isdigit() or not isinstance(val, dict):
            continue
        lines = [str(x).strip()[:500] for x in (val.get("lines") or [])
                 if str(x).strip()][:30]
        weeks[str(int(key))] = {
            "lines": lines,
            "topic": str(val.get("topic") or (lines[0] if lines else ""))[:160],
            "raw_clo": str(val.get("raw_clo", ""))[:100],
            "clos": _norm_clos(val.get("clos")),
        }
    return {"title": str(obj.get("title") or "")[:255], "clos": clos,
            "weeks": weeks, "source": str(obj.get("source") or "")[:255]}


def preview_outline_bytes(data: bytes, filename: str) -> Dict[str, Any]:
    """Reads an uploaded outline (.docx or .pdf) WITHOUT saving it."""
    ext = Path(filename or "").suffix.lower()
    if ext not in (".docx", ".pdf"):
        return {"ok": False, "error": "Only .docx or .pdf outlines are supported."}
    tmp: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
            f.write(data)
            tmp = Path(f.name)
        outline = parse_outline_pdf(tmp) if ext == ".pdf" else parse_outline_docx(tmp)
        if outline and outline.get("title") == tmp.stem:
            outline["title"] = Path(filename).stem  # no title inside the file
    finally:
        if tmp is not None:
            try:
                tmp.unlink()
            except OSError:
                pass
    if not outline:
        return {"ok": False,
                "error": "No course learning outcomes (CLOs) were found. "
                         "Check that the outline contains CLO IDs and their descriptions."}
    outline["source"] = filename
    return {"ok": True, "outline": outline,
            "warnings": outline_warnings(outline)}


def save_outline_for_teacher(teacher: str, course: str,
                             outline: Any, source_name: str = "") -> Dict[str, Any]:
    """Saves the (checked) outline of a course for this teacher."""
    clean = clean_outline(outline)
    if not clean:
        return {"ok": False,
                "error": "The outline data is not valid (no CLOs found)."}
    try:
        from . import ai_db
        saved = ai_db.save_outline(
            teacher, course, clean, source_name or clean.get("source", ""))
    except Exception as exc:
        print(f"[AI] Could not save the outline in the database: {exc}")
        saved = False
    stored_in = "database"
    if not saved:
        # Database not running: keep the outline as a file so it still works.
        if not _save_uploaded_outline(teacher, course, clean):
            return {"ok": False, "error": "The outline could not be saved."}
        stored_in = "file (database not available)"
    return {"ok": True, "course": course, "clos": len(clean["clos"]),
            "weeks": len(clean["weeks"]), "stored_in": stored_in,
            "warnings": outline_warnings(clean)}


def _outline_candidates(outline: Dict[str, Any]) -> List[tuple]:
    rows = []
    for n, row in sorted((outline.get("weeks") or {}).items(),
                         key=lambda kv: int(kv[0])):
        topic = row.get("topic", "")
        if re.search(r"\bexam", topic, re.I):  # midterm / final are not lectures
            continue
        rows.append((int(n), topic))
    return rows


def map_clos(course: str, week: Optional[int], title: str,
             content: str, kind: str, teacher: str = "") -> Dict[str, Any]:
    """
    kind = 'lecture' | 'assignment'.

    Gemini reads the CONTENT and picks the outline week it belongs to
    (a lecture can sit in Moellim Week 2 while its topic is outline Week 1).
    The CLO(s) and the topic lines come from that outline row.
    Without Gemini, the Moellim week number is used and the item is flagged.
    """
    outline = find_outline(course, teacher)
    if not outline:
        print(f"[AI] CLO mapping skipped: no outline for '{course}'. "
              "Add it to outlines/course_map.json or upload the outline.")
        return {"clos": [], "week_clos": [], "llm_clos": [], "method": "no_outline",
                "needs_review": True, "outline_week": None, "outline_lines": [],
                "reason": f"No course outline is available for '{course}'. "
                          "Upload the outline of this course to get CLO mapping."}

    defined = outline["clos"]
    weeks = outline.get("weeks") or {}
    candidates = _outline_candidates(outline)
    notes: List[str] = []
    needs_review = False
    matched: Optional[int] = None
    method = "unmapped"

    # ---- Gemini: which outline week does this content belong to? ----
    if llm_ready() and (content or "").strip() and candidates:
        listing = "\n".join(f"Week {n}: {t}" for n, t in candidates)
        data = gemini_json(
            f"Course: {outline.get('title')}\nItem type: {kind}\nTitle: {title}\n\n"
            f"OUTLINE TOPICS:\n{listing}\n\nCONTENT:\n{content[:MAX_SOURCE_CHARS]}\n\n"
            'Return JSON: {"week": <outline week number>, "reason": "one short sentence"}. '
            "Choose the single outline week whose topic this content mainly covers.",
            "You match teaching material to the right week of a course outline. "
            "Use only the content provided.",
        )
        if isinstance(data, dict):
            try:
                n = int(data.get("week"))
            except (TypeError, ValueError):
                n = None
            if n is not None and any(n == c[0] for c in candidates):
                matched, method = n, "content_to_outline_week"
                notes.append(str(data.get("reason") or "")[:300])

    if matched is None:
        if week and str(week) in weeks:
            matched, method, needs_review = int(week), "moellim_week_number", True
            notes.append("Gemini could not match the content; the Moellim week "
                         "number was used instead.")
        else:
            return {"clos": [], "week_clos": [], "llm_clos": [], "method": "unmapped",
                    "needs_review": True, "outline_week": None, "outline_lines": [],
                    "reason": "Could not map this item to the outline."}
    elif week and matched != week:
        notes.append(f"Content matches outline Week {matched} "
                     f"(it is placed in Moellim Week {week}).")

    row = weeks[str(matched)]
    clos = _norm_clos(row.get("clos"))
    undefined = [c for c in clos if c not in defined]
    if undefined:
        needs_review = True
        notes.append(f"The outline lists {', '.join(undefined)} for Week {matched} "
                     "but defines no such CLO.")
    if outline.get("assumed"):
        needs_review = True
        notes.append("Course name did not match an outline; the only loaded "
                     "outline was used.")
    if not clos:
        needs_review = True

    return {"clos": clos, "week_clos": clos, "llm_clos": [], "method": method,
            "needs_review": needs_review, "outline_week": matched,
            "outline_lines": row.get("lines") or [row.get("topic", "")],
            "reason": " ".join(n for n in notes if n),
            "clo_text": {c: defined[c]["text"] for c in clos if c in defined}}


# ============================================================
# LECTURE DESCRIPTION + KEY POINTS
# ============================================================
def _extractive_lecture_summary(text: str, heading: str) -> Optional[Dict[str, Any]]:
    """Safe offline fallback: selects source sentences; it does not invent facts."""
    clean = re.sub(r"\s+", " ", (text or "")).strip()
    if len(clean) < 80:
        return None
    sentences = [re.sub(r"\s+", " ", x).strip(" -Ã¢â‚¬Â¢\t")
                 for x in re.split(r"(?<=[.!?])\s+|\s+[Ã¢â‚¬Â¢Ã¢â€“Âª]\s+", clean)]
    sentences = [x for x in sentences if 35 <= len(x) <= 260]
    if not sentences:
        chunks = [clean[i:i + 180].strip() for i in range(0, min(len(clean), 1400), 180)]
        sentences = [x for x in chunks if len(x) >= 45]
    if not sentences:
        return None
    stop = {"about", "after", "again", "also", "among", "because", "being", "between", "could", "from", "have", "into", "more", "most", "other", "over", "such", "than", "that", "their", "there", "these", "they", "this", "those", "through", "using", "what", "when", "where", "which", "while", "with", "within", "would", "your", "the", "and", "for", "are", "was", "were", "has", "had", "can", "will", "not", "you", "its", "our", "but", "one", "two", "use", "used"}
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9-]{2,}", clean.lower())
    freq = {}
    for word in words:
        if word not in stop:
            freq[word] = freq.get(word, 0) + 1
    ranked = []
    for index, sentence in enumerate(sentences):
        tokens = [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9-]{2,}", sentence.lower()) if w not in stop]
        score = sum(freq.get(w, 0) for w in tokens) / max(len(tokens), 1)
        if re.search(r"\b(defin|include|consist|refer|type|level|process|method|example|important|known|called|means)\w*\b", sentence, re.I):
            score += 1.5
        ranked.append((score, index, sentence))
    chosen = sorted(sorted(ranked, key=lambda x: x[0], reverse=True)[:7], key=lambda x: x[1])
    points = [x[2][:140] for x in chosen]
    description = " ".join(sentences[:2])[:400]
    return {"description": description, "key_points": points}


def describe_lecture(text: str, heading: str) -> Optional[Dict[str, Any]]:
    if len((text or "").strip()) < 80:
        return None
    if llm_ready():
        data = gemini_json(
            f"Lecture heading: {heading}\n\nLECTURE TEXT:\n{text[:MAX_SOURCE_CHARS]}\n\n"
            'Return JSON: {"description": "1-2 sentences for students", '
            '"key_points": ["5 to 7 short points"]}. Each key point under 120 '
            "characters. Use only facts present in the lecture text.",
            "You summarise university lecture slides for students. "
            "Never add facts that are not in the text.",
        )
        if isinstance(data, dict):
            points = [re.sub(r"\s+", " ", str(p)).strip()
                      for p in (data.get("key_points") or []) if str(p).strip()]
            desc = re.sub(r"\s+", " ", str(data.get("description") or "")).strip()
            if desc and points:
                return {"description": desc[:400], "key_points": [p[:140] for p in points[:7]]}
            print("[AI] Gemini returned incomplete lecture analysis; using extractive fallback.")
        else:
            print("[AI] Gemini unavailable for lecture analysis; using extractive fallback.")
    return _extractive_lecture_summary(text, heading)


# ============================================================
# ASSIGNMENT QUESTIONS (Gemini, with your rule-based generator as fallback)
# ============================================================
_original_generate_assignment = asg.generate_assignment

TYPE_HELP = {
    "short": "short answer (2-3 sentences)",
    "long": "long answer (a structured discussion)",
    "scenario": "scenario / case-based question",
    "practical": "practical, application-based question",
}


def llm_generate_assignment(lecture_content: str, total_marks: int,
                            question_types) -> List[Any]:
    lecture_content = asg.clean_text(lecture_content)
    if not lecture_content:
        raise ValueError("Lecture content is empty. Cannot generate assignment.")
    types = asg.normalize_question_types(question_types)
    if not types:
        raise ValueError("No question types were specified.")

    marks = asg.distribute_marks(total_marks, types)
    plan: List[tuple] = []
    k = 0
    for qtype, count in types.items():
        for _ in range(count):
            plan.append((qtype, marks[k]))
            k += 1

    spec = "\n".join(f"{i + 1}. type={t} ({TYPE_HELP.get(t, t)}), marks={m}"
                     for i, (t, m) in enumerate(plan))
    data = gemini_json(
        f"LECTURE TEXT:\n{lecture_content[:MAX_SOURCE_CHARS]}\n\n"
        f"Write exactly {len(plan)} assignment questions in this order:\n{spec}\n\n"
        'Return JSON: {"questions": [{"type": "short", "question": "..."}]} '
        "with exactly that many items, in that order. Questions must come "
        "from the lecture text only, must not repeat each other, and must not "
        "mention slides or page numbers. Do not write answers.",
        "You write fair university assignment questions strictly from the "
        "given lecture text.",
        timeout=60,
    )
    items = (data or {}).get("questions") if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) != len(plan):
        raise RuntimeError("Gemini did not return the requested number of questions.")

    questions = []
    for i, ((qtype, mark), item) in enumerate(zip(plan, items), start=1):
        text = re.sub(r"\s+", " ", str(
            item.get("question") if isinstance(item, dict) else item)).strip()
        if len(text) < 15:
            raise RuntimeError(f"Gemini question {i} is empty or too short.")
        questions.append(asg.GeneratedQuestion(
            number=i, question_type=qtype, question=text, marks=mark))
    return questions


def generate_assignment_with_llm(lecture_content: str, total_marks: int,
                                 question_types) -> List[Any]:
    if llm_ready() and os.getenv("MUAWIN_LLM_QUESTIONS", "1") != "0":
        try:
            questions = llm_generate_assignment(
                lecture_content, total_marks, question_types)
            print(f"Ã¢Å“â€œ Questions generated by Gemini ({_model()}).")
            return questions
        except Exception as exc:
            print(f"[AI] Gemini questions failed ({exc}); "
                  "using the rule-based generator.")
    return _original_generate_assignment(
        lecture_content, total_marks, question_types)


def generate_simple_assignment_with_llm(
    lecture_content: str,
    total_marks: int,
    question_types=None,
) -> List[Any]:
    """Gemini dynamically selects question count and suitable types for Simple Assignment."""
    lecture = asg.clean_text(lecture_content)
    fallback = asg.generate_simple_assignment

    if not lecture:
        raise ValueError("Lecture content is empty.")

    if not llm_ready() or os.getenv("MUAWIN_LLM_QUESTIONS", "1") == "0":
        return fallback(lecture, total_marks, question_types)

    try:
        concepts = asg.select_distinct_concepts(lecture)
        content_units = [
            part.strip()
            for part in re.split(r"(?<=[.!?])\\s+|\\n+", lecture)
            if len(part.strip()) >= 35
        ]
        # Estimate assignment capacity from lecture coverage, not the
        # conservative rule-based concept extractor.
        content_capacity = max(2, int(math.sqrt(max(len(content_units), 1))) + 2)
        max_questions = min(10, int(total_marks), content_capacity)
        if max_questions < 2:
            return fallback(lecture, total_marks, question_types)

        data = gemini_json(
            f"LECTURE TEXT:\\n{lecture[:MAX_SOURCE_CHARS]}\\n\\n"
            f"Analyse the lecture and create an appropriate university assignment. "
            f"Choose the number of questions yourself, from 2 to {max_questions}, "
            f"based on the lecture's actual depth, distinct concepts and coverage. "
            "Choose only relevant types from: short, long, practical, scenario. "
            "Do not force a type if the lecture does not support it. "
            "Do not create MCQs. Avoid repeated concepts and questions. "
            "Every question must be answerable from the supplied lecture only. "
            "Return JSON exactly in this shape: "
            '{"questions":[{"type":"short","question":"..."}]}. '
            "Do not include answers.",
            "You are an experienced university assessment designer. "
            "Choose a balanced, content-appropriate assignment. Never invent "
            "facts or force irrelevant question types.",
            timeout=60,
        )

        items = data.get("questions") if isinstance(data, dict) else None
        if not isinstance(items, list) or not (2 <= len(items) <= max_questions):
            raise RuntimeError("Gemini returned an invalid dynamic question count.")

        normalized = []
        counts = {}
        for i, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                raise RuntimeError(f"Gemini question {i} has an invalid format.")
            raw_type = str(item.get("type") or "").strip()
            mapped = asg.normalize_question_types({raw_type: 1})
            if not mapped or len(mapped) != 1:
                raise RuntimeError(f"Gemini selected an unsupported type: {raw_type}")
            qtype = next(iter(mapped))
            question_text = re.sub(
                r"\\s+", " ", str(item.get("question") or "")
            ).strip()
            if len(question_text) < 15:
                raise RuntimeError(f"Gemini question {i} is too short.")
            normalized.append((qtype, question_text))
            counts[qtype] = counts.get(qtype, 0) + 1

        if len(normalized) > max_questions:
            raise RuntimeError("Gemini exceeded the content-based question limit.")

        grouped_marks = asg.distribute_marks(total_marks, counts)
        marks_by_type = {}
        k = 0
        for qtype, quantity in counts.items():
            marks_by_type[qtype] = grouped_marks[k:k + quantity]
            k += quantity

        questions = []
        for i, (qtype, question_text) in enumerate(normalized, start=1):
            mark = marks_by_type[qtype].pop(0)
            questions.append(asg.GeneratedQuestion(
                number=i,
                question_type=qtype,
                question=question_text,
                marks=mark,
            ))

        if sum(q.marks for q in questions) != total_marks:
            raise RuntimeError("Dynamic question marks do not match total marks.")

        print(
            f"[AI] Dynamic Simple Assignment generated by Gemini ({_model()}): "
            f"{len(questions)} questions, {counts}"
        )
        return questions

    except Exception as exc:
        print(f"[AI] Dynamic Simple Assignment Gemini failed ({exc}); using content-based fallback.")
        return fallback(lecture, total_marks, question_types)



# ============================================================
# DRAFT ENRICHMENT
# ============================================================
def _apply_clo_description(draft: Dict[str, Any], clo: Dict[str, Any],
                           kind: str) -> None:
    """
    Lecture   : description = 'CLO 1' + the outline topics of that week
                (the format used on your Moellim course page).
    Assignment: 'Mapped CLO: CLO 3' is added to the end of the description.
    Visible and editable in the review screen.
    MUAWIN_CLO_IN_DESCRIPTION=0 keeps all of this off Moellim.
    """
    if os.getenv("MUAWIN_CLO_IN_DESCRIPTION", "1") == "0":
        return
    clos = clo.get("clos") or []
    if not clos:
        return
    label = ", ".join(fmt_clo(c) for c in clos)

    # Lecture description must remain based on the actual lecture content.
    # CLO mapping is stored separately and must not overwrite that description.
    if kind == "lecture":
        return

    desc = draft.get("description") or ""
    if "Mapped CLO" not in desc:
        if "<" in desc:
            draft["description"] = (
                desc + f"<p><strong>Mapped CLO:</strong> {label}</p>")
        else:
            draft["description"] = (
                desc.rstrip() + "\nMapped CLO: " + label).strip()


def _log_clo(kind: str, clo: Dict[str, Any]) -> None:
    """One line in the terminal, so the CLO result can be checked there."""
    if clo.get("clos"):
        print(f"[AI] CLO ({kind}): {', '.join(fmt_clo(c) for c in clo['clos'])} "
              f"| outline week {clo.get('outline_week')} | {clo.get('method')}"
              f"{' | NEEDS REVIEW' if clo.get('needs_review') else ''}")
    else:
        print(f"[AI] CLO ({kind}): none | {clo.get('method')} | "
              f"{clo.get('reason')}")


def lines_to_html(text: str) -> str:
    """Multi-line description -> paragraphs, 'Label: text' gets a bold label."""
    esc = lec.escape_html
    out = []
    for line in (text or "").split("\n"):
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^([^:]{3,60}):\s+(.+)$", line)
        if m:
            out.append(f"<p><strong>{esc(m.group(1))}:</strong> {esc(m.group(2))}</p>")
        else:
            out.append(f"<p>{esc(line)}</p>")
    return "".join(out)


def _read_text(file_path) -> str:
    try:
        return asg.local_file_to_text(Path(file_path))
    except Exception as exc:
        print(f"[AI] Could not read lecture text: {exc}")
        return ""


def enrich_lecture_draft(draft: Dict[str, Any], *, course: str,
                         week: Optional[int], file_path, teacher: str) -> None:
    """Adds description/key points, CLO mapping and the upload-day question."""
    if not isinstance(draft, dict):
        return
    try:
        text = _read_text(file_path)
        heading = draft.get("heading") or Path(str(file_path)).stem

        info = describe_lecture(text, heading)
        if info:
            # Always generate description from the actual lecture file.
            draft["description"] = info["description"]
            draft["auto_description"] = False
            if not draft.get("key_points"):
                draft["key_points"] = info["key_points"]
            draft["ai"] = {"model": _model(), "used_for": "description+key_points"}
        else:
            print("[AI] Lecture description not generated: insufficient readable lecture text.")

        draft["clo"] = map_clos(course, week, heading, text, "lecture", teacher)
        _log_clo("lecture", draft["clo"])
        _apply_clo_description(draft, draft["clo"], "lecture")

        try:
            from . import ai_db
            check = ai_db.upload_day_check(teacher, course)
        except Exception as exc:  # no database: ask the teacher to be safe
            check = {
                "required": True, "status": "history_unavailable",
                "usual_days": [], "history_count": 0,
                "question": ("Upload history is not available, so MUAWIN cannot "
                             "tell if this is your usual day. Do you want to "
                             "upload this lecture now?"),
            }
            print(f"[AI] Upload-day check unavailable: {exc}")
        draft["upload_confirmation"] = check
        if check["required"]:
            old = draft.get("note") or ""
            draft["note"] = (old + " | " if old else "") + check["question"]
    except Exception as exc:
        print(f"[AI] Lecture enrichment skipped: {exc}")


def html_to_text(html: str) -> str:
    """'<p>Total Marks: 15</p><p>..</p>' -> plain lines (what the review
    screen should show). Moellim still receives HTML (see set_description)."""
    import html as _html
    t = re.sub(r"</p\s*>|<br\s*/?>|</li\s*>|</div\s*>", "\n", html or "", flags=re.I)
    t = _html.unescape(re.sub(r"<[^>]+>", "", t))
    return "\n".join(ln.strip() for ln in t.split("\n") if ln.strip())


def enrich_assignment_draft(draft: Dict[str, Any], *, course: str,
                            week: Optional[int], teacher: str = "",
                            clo: Optional[Dict[str, Any]] = None) -> None:
    """
    `clo`: the CLO of the lecture this assignment is made from (combined
    workflow). When it has CLOs, the assignment gets the same ones instead of
    a second, separate guess.
    """
    if not isinstance(draft, dict):
        return
    # The review screen shows the description as plain text, so keep it
    # plain here; the HTML for Moellim is built again when it is saved.
    if isinstance(draft.get("description"), str) and "<" in draft["description"]:
        draft["description"] = html_to_text(draft["description"])
    try:
        if clo and clo.get("clos"):
            draft["clo"] = {**clo, "method": "same_as_lecture",
                            "reason": "The assignment is made from this lecture."}
        else:
            parts = []
            for q in (draft.get("questions") or []):
                parts.append(q.get("question", "") if isinstance(q, dict)
                             else getattr(q, "question", ""))
            content = f"{draft.get('title', '')}\n{' '.join(parts)}"
            draft["clo"] = map_clos(course, week, draft.get("title", ""),
                                    content, "assignment", teacher)
        _log_clo("assignment", draft["clo"])
        _apply_clo_description(draft, draft["clo"], "assignment")
    except Exception as exc:
        print(f"[AI] Assignment CLO mapping skipped: {exc}")


# ============================================================
# SAVE AFTER A SUCCESSFUL UPLOAD
# ============================================================
def _record_lecture(teacher, course, week, draft, file_name) -> None:
    try:
        from . import ai_db
        title = (draft or {}).get("heading") or file_name
        ai_db.record_upload(teacher, course, week, "lecture", title, file_name)
        clo = (draft or {}).get("clo")
        if clo:
            ai_db.save_clo_mapping(teacher, course, week, "lecture", title, clo)
    except Exception as exc:
        print(f"[AI] Could not save lecture record: {exc}")


def _record_assignment(teacher, course, week, draft) -> None:
    try:
        from . import ai_db
        title = (draft or {}).get("title") or ""
        ai_db.record_upload(teacher, course, week, "assignment", title, "")
        clo = (draft or {}).get("clo")
        if clo:
            ai_db.save_clo_mapping(teacher, course, week, "assignment", title, clo)
    except Exception as exc:
        print(f"[AI] Could not save assignment record: {exc}")


# ============================================================
# COMBINED WORKFLOW: the assignment is made from the lecture that is
# being uploaded, unless the teacher names another source
# ============================================================
def _source_is_unspecified(source: Any) -> bool:
    if source is None:
        return True
    if isinstance(source, str):
        return not source.strip()
    if isinstance(source, dict):
        return not any(source.get(k) not in (None, "", False)
                       for k in ("uploaded", "week", "lecture", "name"))
    return False


def default_source_to_uploaded_lecture(assignment_job: Any) -> Any:
    """
    "Upload X to Week 1 and create assignment ..." names no source for the
    assignment. server.py then looks for a lecture that is already inside the
    Moellim week (empty for a new upload) and stops. Here such a request is
    marked as "use the lecture being uploaded"; server.py already has that
    path (source["uploaded"]) and reads the local file for it.

    A request that names a source ("from Lecture 3", "from the Week 2
    lecture", "from the uploaded lecture") is left exactly as it is.
    """
    if not isinstance(assignment_job, dict):
        return assignment_job
    source = assignment_job.get("source")
    if _source_is_unspecified(source):
        marked = dict(source) if isinstance(source, dict) else {}
        marked["uploaded"] = True
        assignment_job["source"] = marked
    return assignment_job


# ============================================================
# INSTALL  (wraps your functions, nothing on disk is changed)
# ============================================================
OUTLINE_PAGE_HTML = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MUAWIN Course Outline</title>
<style>
  :root { --bg:#f5f6fa; --card:#fff; --ink:#1d2433; --mute:#6b7385; --line:#dfe3ec;
          --brand:#2f5bd8; --ok:#1c7c4d; --warn:#9a5b00; --bad:#b3261e; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#12151c; --card:#1b2030; --ink:#e8ebf3; --mute:#9aa3b8; --line:#2c3347;
            --brand:#7aa2ff; --ok:#5cd18f; --warn:#f0b255; --bad:#ff8a80; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:640px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:24px; margin:0 0 4px; }
  p.sub { margin:0 0 24px; color:var(--mute); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px;
          padding:20px; margin-bottom:16px; }
  label { display:block; font-weight:600; margin:0 0 6px; }
  input[type=text], input[type=password], select {
    width:100%; padding:10px 12px; font-size:16px; color:var(--ink); background:var(--bg);
    border:1px solid var(--line); border-radius:8px; margin-bottom:14px; }
  button { font:inherit; font-weight:600; padding:10px 18px; border-radius:8px; border:0;
           background:var(--brand); color:#fff; cursor:pointer; }
  button.ghost { background:transparent; color:var(--brand); border:1px solid var(--line); }
  button:disabled { opacity:.5; cursor:default; }
  #drop { border:2px dashed var(--line); border-radius:12px; padding:36px 16px; text-align:center;
          color:var(--mute); cursor:pointer; transition:.15s; }
  #drop.over { border-color:var(--brand); background:rgba(47,91,216,.07); color:var(--ink); }
  #drop strong { color:var(--ink); display:block; font-size:18px; margin-bottom:4px; }
  .msg { margin:12px 0 0; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .warn { color:var(--warn); }
  ul { margin:6px 0 0; padding-left:20px; }
  li { margin:2px 0; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .hide { display:none; }
  .tag { display:inline-block; padding:2px 10px; border-radius:99px; background:var(--bg);
         border:1px solid var(--line); font-size:14px; }
</style>
</head>
<body>
<main>
  <h1>Course Outline</h1>
  <p class="sub">Upload the outline of a course once. Every lecture and assignment you
  upload afterwards is mapped to its CLOs.</p>

  <section class="card" id="loginCard">
    <label for="user">Moellim ID</label>
    <input type="text" id="user" autocomplete="username">
    <label for="pass">Password</label>
    <input type="password" id="pass" autocomplete="current-password">
    <button id="loginBtn">Log in</button>
    <p class="msg bad hide" id="loginErr"></p>
  </section>

  <section class="hide" id="work">
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <span>Logged in as <strong id="who"></strong></span>
        <button class="ghost" id="logoutBtn">Log out</button>
      </div>
      <label for="course">1. Choose the course</label>
      <select id="course"></select>
      <p class="msg" id="have"></p>
    </div>

    <div class="card">
      <label>2. Drop the outline here (PDF or Word)</label>
      <div id="drop" tabindex="0">
        <strong>Drag and drop the file here</strong>
        or click to choose it
      </div>
      <input type="file" id="file" accept=".pdf,.docx" class="hide">
      <p class="msg" id="fileMsg"></p>
    </div>

    <div class="card hide" id="previewCard">
      <label>3. Check what was read</label>
      <p id="summary" style="margin:0"></p>
      <ul id="clos"></ul>
      <div id="warnBox" class="hide">
        <p class="warn" style="margin:12px 0 0"><strong>Please check:</strong></p>
        <ul id="warns" class="warn"></ul>
      </div>
      <div class="row" style="margin-top:16px">
        <button id="saveBtn">Save outline</button>
        <button class="ghost" id="cancelBtn">Choose another file</button>
      </div>
      <p class="msg" id="saveMsg"></p>
    </div>
  </section>
</main>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var token = null, chosen = null;
  try { token = sessionStorage.getItem("muawin_token"); } catch (e) {}

  function show(el, on) { el.classList[on ? "remove" : "add"]("hide"); }
  function setMsg(el, text, cls) { el.textContent = text || ""; el.className = "msg " + (cls || ""); }

  function api(method, path, body, isForm) {
    var opts = { method: method, headers: {} };
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    if (body && !isForm) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    if (body && isForm) opts.body = body;
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, data: j }; });
    });
  }
  function detail(r) {
    var d = r.data && r.data.detail;
    return typeof d === "string" ? d : "Something went wrong (code " + r.status + ").";
  }

  function enter(name, courses) {
    show($("loginCard"), false); show($("work"), true);
    $("who").textContent = name;
    var sel = $("course"); sel.innerHTML = "";
    courses.forEach(function (c) { var o = document.createElement("option"); o.textContent = c; o.value = c; sel.appendChild(o); });
    checkHave();
  }
  function leave() {
    token = null; try { sessionStorage.removeItem("muawin_token"); sessionStorage.removeItem("muawin_login"); } catch (e) {}
    show($("work"), false); show($("loginCard"), true); resetFile();
  }

  $("loginBtn").onclick = function () {
    var u = $("user").value.trim(), p = $("pass").value;
    if (!u || !p) { setMsg($("loginErr"), "Enter your Moellim ID and password.", "bad"); show($("loginErr"), true); return; }
    $("loginBtn").disabled = true; $("loginBtn").textContent = "Logging in...";
    api("POST", "/api/auth/login", { username: u, password: p }).then(function (r) {
      $("loginBtn").disabled = false; $("loginBtn").textContent = "Log in";
      if (!r.ok || !r.data.auth_token) { setMsg($("loginErr"), detail(r), "bad"); show($("loginErr"), true); return; }
      token = r.data.auth_token; show($("loginErr"), false); $("pass").value = "";
      var names = (r.data.courses || []).map(function (c) { return c && c.name; }).filter(Boolean);
      try { sessionStorage.setItem("muawin_token", token);
            sessionStorage.setItem("muawin_login", JSON.stringify({ name: r.data.name || u, courses: names })); } catch (e) {}
      enter(r.data.name || u, names);
    }).catch(function () { $("loginBtn").disabled = false; $("loginBtn").textContent = "Log in";
      setMsg($("loginErr"), "Could not reach the server.", "bad"); show($("loginErr"), true); });
  };
  $("pass").onkeydown = function (e) { if (e.key === "Enter") $("loginBtn").onclick(); };
  $("logoutBtn").onclick = leave;
  $("course").onchange = checkHave;

  function checkHave() {
    var c = $("course").value; if (!c) return;
    api("GET", "/api/ai/outlines/status?course=" + encodeURIComponent(c)).then(function (r) {
      if (r.status === 401) { leave(); return; }
      if (r.ok && r.data.has_outline) setMsg($("have"), "This course already has an outline (" + r.data.weeks + " weeks). Uploading a new file replaces it.", "ok");
      else setMsg($("have"), "No outline uploaded for this course yet.", "warn");
    });
  }

  var drop = $("drop"), input = $("file");
  drop.onclick = function () { input.click(); };
  drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") input.click(); };
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (f) pick(f); });
  input.onchange = function () { if (input.files[0]) pick(input.files[0]); };
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });

  function resetFile() { chosen = null; input.value = ""; show($("previewCard"), false); setMsg($("fileMsg"), ""); setMsg($("saveMsg"), ""); }
  $("cancelBtn").onclick = resetFile;

  function pick(f) {
    resetFile();
    if (!/\.(pdf|docx)$/i.test(f.name)) { setMsg($("fileMsg"), "Please choose a PDF or Word (.docx) file.", "bad"); return; }
    chosen = f; setMsg($("fileMsg"), "Reading " + f.name + " ...", "");
    var fd = new FormData(); fd.append("file", f);
    api("POST", "/api/ai/outlines/preview", fd, true).then(function (r) {
      if (r.status === 401) { leave(); return; }
      if (!r.ok) { chosen = null; setMsg($("fileMsg"), detail(r), "bad"); return; }
      setMsg($("fileMsg"), f.name, "");
      var d = r.data, clos = d.clos || {}, keys = Object.keys(clos);
      $("summary").textContent = "Found " + keys.length + " CLOs and " + d.weeks + " weeks.";
      var ul = $("clos"); ul.innerHTML = "";
      keys.forEach(function (k) { var li = document.createElement("li");
        li.textContent = k + ": " + String((clos[k] && clos[k].text) || "").slice(0, 140); ul.appendChild(li); });
      var w = d.warnings || [], wl = $("warns"); wl.innerHTML = "";
      w.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; wl.appendChild(li); });
      show($("warnBox"), w.length > 0);
      show($("previewCard"), true); $("saveBtn").disabled = false;
    }).catch(function () { setMsg($("fileMsg"), "Could not reach the server.", "bad"); });
  }

  $("saveBtn").onclick = function () {
    if (!chosen) return;
    var fd = new FormData(); fd.append("course", $("course").value); fd.append("file", chosen);
    $("saveBtn").disabled = true; setMsg($("saveMsg"), "Saving ...", "");
    api("POST", "/api/ai/outlines/upload", fd, true).then(function (r) {
      if (r.status === 401) { leave(); return; }
      if (!r.ok) { $("saveBtn").disabled = false; setMsg($("saveMsg"), detail(r), "bad"); return; }
      setMsg($("saveMsg"), "Saved for " + r.data.course + ". You can now upload lectures and assignments.", "ok");
      checkHave();
    }).catch(function () { $("saveBtn").disabled = false; setMsg($("saveMsg"), "Could not reach the server.", "bad"); });
  };

  try { var saved = JSON.parse(sessionStorage.getItem("muawin_login") || "null");
        if (token && saved) enter(saved.name, saved.courses); } catch (e) {}
})();
</script>
</body>
</html>
'''


_installed = False
_SERVER = None


# ---------- "upload the outline first" rule ----------
def outline_required() -> bool:
    return os.getenv("MUAWIN_REQUIRE_OUTLINE", "1") != "0"


def require_outline(course: Optional[str], teacher: str) -> None:
    """Stops a lecture / assignment / combined command BEFORE Moellim is
    opened when the teacher has not uploaded the outline of this course."""
    if not outline_required() or not course:
        return
    if find_outline(course, teacher):
        try:
            from . import ai_db
            class_schedule = ai_db.get_schedule(teacher, course)
            if not class_schedule:
                raise RuntimeError(
                    f"Class schedule for '{course}' is not saved yet. "
                    "Save the class days and timings in Course Setup first."
                )
        except RuntimeError:
            raise
        except Exception as exc:
            print(f"[AI] Class schedule check skipped: {exc}")
        return
    raise RuntimeError(
        f"No course outline found for '{course}'. Upload the outline of this "
        "course first (POST /api/ai/outlines/upload), then give the command "
        "again. Lectures and assignments are mapped to its CLOs.")


# ---------- outline API (backend only; Swagger page: /docs) ----------
try:
    from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
    from fastapi.responses import HTMLResponse
except Exception:  # fastapi always exists in the real project
    APIRouter = None


try:
    from pydantic import BaseModel

    class ScheduleBody(BaseModel):
        course: str
        slots: List[Dict[str, Any]] = []
except Exception:
    ScheduleBody = None


def api_schedule_get(course: str, authorization: Optional[str] = Header(None)):
    teacher = _teacher_name(authorization)
    try:
        from . import ai_db
        return {"course": course, "slots": ai_db.get_schedule(teacher, course)}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database not available: {exc}")


def api_schedule_save(body: "ScheduleBody", authorization: Optional[str] = Header(None)):
    teacher = _teacher_name(authorization)
    try:
        from . import ai_db
        saved = ai_db.save_schedule(teacher, body.course.strip(), body.slots)
    except Exception as exc:
        saved = None
        print(f"[AI] Could not save the schedule: {exc}")
    if saved is None:
        raise HTTPException(status_code=503,
                            detail="Database not available, schedule not saved.")
    return {"ok": True, "course": body.course, "slots_saved": saved}


def outline_page():
    """The page teachers use: http://localhost:8000/outline"""
    return HTMLResponse(OUTLINE_PAGE_HTML)


def _teacher_name(authorization: Optional[str]) -> str:
    session = _SERVER.get_teacher_session(authorization)
    return session.get("username", "")


def api_outline_status(course: str, authorization: Optional[str] = Header(None)):
    teacher = _teacher_name(authorization)
    outline = find_outline(course, teacher)
    if not outline:
        return {"has_outline": False, "course": course,
                "message": "Upload the outline of this course to get CLO mapping."}
    return {"has_outline": True, "course": course,
            "title": outline.get("title"),
            "clos": sorted((outline.get("clos") or {}).keys()),
            "weeks": len(outline.get("weeks") or {}),
            "source": outline.get("source")}


def api_outline_list(authorization: Optional[str] = Header(None)):
    teacher = _teacher_name(authorization)
    files = []
    if UPLOADED_DIR.exists():
        prefix = f"{_safe_name(teacher)}__"
        files = [p.stem[len(prefix):] for p in UPLOADED_DIR.glob(f"{prefix}*.json")]
    saved = []
    try:
        from . import ai_db
        saved = ai_db.list_outlines(teacher) or []
    except Exception as exc:
        print(f"[AI] Could not list outlines: {exc}")
    return {"database": saved, "files": files}


def api_outline_preview(file: UploadFile = File(...),
                        authorization: Optional[str] = Header(None)):
    _teacher_name(authorization)
    result = preview_outline_bytes(file.file.read(), file.filename or "")
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    outline = result["outline"]
    return {"ok": True, "title": outline.get("title"),
            "clos": outline.get("clos"), "weeks": len(outline.get("weeks") or {}),
            "warnings": result.get("warnings", [])}


async def api_outline_upload(course: str = Form(...), file: UploadFile = File(...),
                       authorization: Optional[str] = Header(None)):
    teacher = _teacher_name(authorization)
    original_name = Path(file.filename or "course_outline.pdf").name
    data = await file.read()
    result = preview_outline_bytes(data, original_name)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error"))

    saved = save_outline_for_teacher(
        teacher, course.strip(), result["outline"], original_name)
    if not saved.get("ok"):
        raise HTTPException(status_code=500, detail=saved.get("error"))

    safe_teacher = re.sub(r"[^A-Za-z0-9_-]+", "_", teacher).strip("_") or "teacher"
    safe_course = re.sub(r"[^A-Za-z0-9_-]+", "_", course.strip()).strip("_") or "course"
    storage = Path(__file__).resolve().parent / "data" / "course_setup_files" / safe_teacher / safe_course
    storage.mkdir(parents=True, exist_ok=True)
    stored_file = storage / original_name
    stored_file.write_bytes(data)

    from . import ai_db
    if not ai_db.save_course_document_paths(
        teacher, course.strip(), outline_file_path=str(stored_file)
    ):
        raise HTTPException(status_code=500, detail="Outline parsed, but original file path could not be saved.")

    saved["original_filename"] = original_name
    return saved


def _install_outline_routes(server) -> None:
    if APIRouter is None:
        return
    router = APIRouter()
    router.add_api_route("/outline", outline_page, methods=["GET"],
                         include_in_schema=False)
    router.add_api_route("/api/ai/outlines/status", api_outline_status, methods=["GET"])
    router.add_api_route("/api/ai/outlines", api_outline_list, methods=["GET"])
    try:
        router.add_api_route("/api/ai/outlines/preview", api_outline_preview,
                             methods=["POST"])
        router.add_api_route("/api/ai/outlines/upload", api_outline_upload,
                             methods=["POST"])
    except Exception as exc:
        print("[AI] Outline upload route NOT installed "
              f"({exc}). Run:  pip install python-multipart")
    if ScheduleBody is not None:
        router.add_api_route("/api/ai/schedule", api_schedule_get, methods=["GET"])
        router.add_api_route("/api/ai/schedule", api_schedule_save, methods=["PUT"])
    server.app.include_router(router)


def restore_typed_assignment_title(wf) -> None:
    """The review page sends its card heading ("COURSE: lecture - Week N") as
    the assignment title when Approve is pressed, which replaces the title the
    teacher typed in the command. Put the typed title back, but only when the
    current title is that automatic heading (a title the teacher edited by
    hand is kept)."""
    try:
        draft = wf.get("draft") or {}
        a = draft.get("assignment")
        typed = ((wf.get("parsed") or {}).get("assignment") or {}).get("title")
        current = (a or {}).get("title") or ""
        if not (a and typed and current and current != typed):
            return
        if re.match(r"^.+:\s.+\s[\u2014\u2013-]\s*Week\s*\d+\s*$", current, re.I):
            a["title"] = typed
            print(f"[AI] Assignment title restored to the typed one: {typed}")
    except Exception as exc:
        print(f"[AI] Title check skipped: {exc}")


def install(server) -> None:
    """`server` is the imported backend.server module."""
    global _installed, _SERVER
    if _installed:
        return
    _installed = True
    _SERVER = server
    try:
        _install_outline_routes(server)
    except Exception as exc:
        print(f"[AI] Outline routes not installed: {exc}")
    try:
        from . import muawin_services
        muawin_services.install(server)
    except Exception as exc:
        print(f"[AI] Setup/tracker routes not installed: {exc}")

    try:
        from . import ai_db
        db_ok = ai_db.ensure_tables()
    except Exception as exc:
        print(f"[AI] Database add-on unavailable: {exc}")
        db_ok = False

    # 0) multi-line descriptions -> paragraphs on the Moellim form
    orig_fill = lec.MoodleAutomation.fill_description

    def fill_description(self, description, key_points):
        if "\n" not in (description or ""):
            return orig_fill(self, description, key_points)
        html = lines_to_html(description)
        if key_points:
            html += "<p><strong>Key Points:</strong></p><ul>"
            html += "".join(f"<li>{lec.escape_html(pt)}</li>" for pt in key_points)
            html += "</ul>"
        body = self.page.frame_locator("#id_introeditor_ifr").locator("body")
        try:
            body.wait_for(timeout=10000)
            body.evaluate(
                """(el, html) => {
                    el.innerHTML = html;
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                }""", html)
        except Exception:
            print("      ! TinyMCE editor nahi mila, textarea use ho raha hai.")
        self.page.locator("#id_introeditor").evaluate(
            """(el, html) => {
                el.value = html;
                el.dispatchEvent(new Event('change', {bubbles: true}));
            }""", html)

    lec.MoodleAutomation.fill_description = fill_description

    # 0b) assignment description: plain lines in the draft -> paragraphs on Moellim
    try:
        orig_set_desc = asg.AssignmentAutomation.set_description

        def set_description(self, html):
            if isinstance(html, str) and html.strip() and "<" not in html:
                html = lines_to_html(html)
            return orig_set_desc(self, html)

        asg.AssignmentAutomation.set_description = set_description
    except Exception as exc:
        print(f"[AI] Assignment description conversion not installed: {exc}")

    # 0c) PDF attach on the assignment form: only acts when it FAILS
    #     (shows what Moellim displays, accepts a listed file, retries once)
    try:
        orig_attach_pdf = asg.AssignmentAutomation.attach_pdf

        def _picker_diag(self) -> None:
            try:
                info = self.page.evaluate("""() => {
                    const q = s => Array.from(document.querySelectorAll(s))
                        .map(e => (e.innerText || '').trim()).filter(Boolean);
                    const fm = document.querySelector('#fitem_id_introattachments');
                    return {filemanager: fm ? fm.innerText : '(file area not found)',
                            errors: q('.fp-msg-text, .alert-danger, '
                                      + '.moodle-exception-message, .fp-msg-error')};
                }""")
                print("  [AI] file area text:",
                      (info.get("filemanager") or "").replace("\n", " | ")[:300])
                print("  [AI] Moellim error messages:", info.get("errors"))
            except Exception as exc:
                print(f"  [AI] could not read the file area: {exc}")

        def attach_pdf(self, pdf_path):
            try:
                return orig_attach_pdf(self, pdf_path)
            except RuntimeError as exc:
                if "PDF upload to Moellim failed" not in str(exc):
                    raise
                print("  [AI] PDF attach failed; checking what Moellim shows ...")
                _picker_diag(self)
                try:
                    listed = self.page.locator(
                        "#fitem_id_introattachments .fp-file, "
                        "#fitem_id_introattachments .fp-filename").count()
                except Exception:
                    listed = 0
                if listed:
                    print("  [AI] A file is listed in 'Additional files'; continuing.")
                    return None
                try:  # close a picker that may still be open, then try once more
                    self.page.keyboard.press("Escape")
                    self.page.wait_for_timeout(1500)
                except Exception:
                    pass
                print("  [AI] Retrying the PDF upload once ...")
                return orig_attach_pdf(self, pdf_path)

        asg.AssignmentAutomation.attach_pdf = attach_pdf
    except Exception as exc:
        print(f"[AI] PDF attach diagnostics not installed: {exc}")

    # 1) Gemini questions (used by the assignment AND the combined workflow)
    asg.generate_assignment = generate_assignment_with_llm
    # Simple Assignment has its own dynamic generator; Combined remains separate.
    asg.generate_simple_assignment = generate_simple_assignment_with_llm

    # 1b) combined workflow: no source named -> use the lecture being uploaded
    try:
        from . import muawin_combined as comb
        orig_parse_combined = comb.parse_combined

        def parse_combined(instruction, selected_course=None):
            result = orig_parse_combined(
                instruction, selected_course=selected_course
            )
            try:
                _lecture_job, assignment_job = result
                if assignment_job:
                    default_source_to_uploaded_lecture(assignment_job)
            except Exception as exc:
                print(f"[AI] Combined source default skipped: {exc}")
            return result

        comb.parse_combined = parse_combined
    except Exception as exc:
        print(f"[AI] Combined source default not installed: {exc}")

    # 2) lecture-only: prepare
    orig_prepare_lecture = server.prepare_moellim_workflow_sync

    def prepare_lecture(wf, session):
        require_outline((wf.get("parsed") or {}).get("course"),
                        session.get("username", ""))
        result = orig_prepare_lecture(wf, session)
        enrich_lecture_draft(
            result.get("draft"),
            course=result.get("course_name") or "",
            week=result.get("week"),
            file_path=result.get("file_path"),
            teacher=session.get("username", ""),
        )
        return result

    server.prepare_moellim_workflow_sync = prepare_lecture

    # 3) lecture-only: after a verified upload
    orig_execute_lecture = server.execute_moellim_workflow_sync

    def execute_lecture(wf, session):
        result = orig_execute_lecture(wf, session)
        _record_lecture(session.get("username", ""), result.get("course", ""),
                        result.get("week"), wf.get("draft"), result.get("file", ""))
        return result

    server.execute_moellim_workflow_sync = execute_lecture

    # 4) assignment only: prepare + after create
    orig_prepare_assignment = server.prepare_assignment_workflow_sync

    def prepare_assignment(wf, session):
        require_outline((wf.get("parsed") or {}).get("course"),
                        session.get("username", ""))
        result = orig_prepare_assignment(wf, session)
        draft = result.get("draft")
        enrich_assignment_draft(
            draft,
            course=(draft or {}).get("course", ""),
            week=(draft or {}).get("week_number"),
            teacher=session.get("username", ""),
        )
        instructions = (wf.get("parsed") or {}).get("class_instructions")
        if draft is not None and instructions:
            draft["description"] = "\n\n".join(filter(None, [draft.get("description"), instructions]))
        return result

    server.prepare_assignment_workflow_sync = prepare_assignment

    orig_execute_assignment = asg.execute_prepared_assignment

    def execute_assignment(workflow):
        result = orig_execute_assignment(workflow)
        draft = workflow.get("draft") or {}
        _record_assignment(workflow.get("username", ""), draft.get("course", ""),
                           draft.get("week_number"), draft)
        return result

    asg.execute_prepared_assignment = execute_assignment

    # 5) combined workflow: prepare + after upload / create
    orig_prepare_combined = server.prepare_combined_workflow_sync

    def prepare_combined(wf, session):
        try:
            from . import muawin_combined as _comb
            _lecture_job, _ = _comb.parse_combined(
                wf.get("request", ""),
                selected_course=wf.get("course"),
            )
            _course = (_lecture_job or {}).get("course")
        except Exception:
            _course = None  # the original code reports its own parse errors
        require_outline(_course, session.get("username", ""))
        result = orig_prepare_combined(wf, session)
        draft = result.get("draft") or {}
        course = draft.get("course", "")
        teacher = session.get("username", "")
        enrich_lecture_draft(
            draft.get("lecture"), course=course, week=draft.get("week"),
            file_path=result.get("_file_path"), teacher=teacher)
        a = draft.get("assignment")
        if a:
            enrich_assignment_draft(
                a, course=course, week=a.get("week_number"), teacher=teacher,
                clo=(draft.get("lecture") or {}).get("clo"))
        return result

    server.prepare_combined_workflow_sync = prepare_combined

    orig_execute_combined = server.execute_combined_workflow_sync

    def execute_combined(wf):
        restore_typed_assignment_title(wf)
        result = orig_execute_combined(wf)
        draft = wf.get("draft") or {}
        teacher = wf.get("username", "")
        course = draft.get("course", "")
        _record_lecture(teacher, course, draft.get("week"),
                        draft.get("lecture"), draft.get("file_name", ""))
        a = draft.get("assignment")
        if a and result.get("assignment"):
            _record_assignment(teacher, course, a.get("week_number"), a)
        return result

    server.execute_combined_workflow_sync = execute_combined

    print("[AI] MUAWIN AI add-on installed | "
          f"Gemini model: {_model()} | key: {'yes' if llm_ready() else 'MISSING'} | "
          f"database tables: {'ok' if db_ok else 'UNAVAILABLE'} | "
          f"outlines: {len(load_outlines())} (folder: {OUTLINES_DIR.name}/)")



# ============================================================
# MULTILINGUAL TEACHER COMMAND INTERPRETATION
# ============================================================

def interpret_teacher_command(instruction: str, course_context: str = "") -> Optional[Dict[str, Any]]:
    """Convert natural teacher commands into canonical English instructions."""

    if not instruction or not instruction.strip() or not llm_ready():
        return None

    system = """
You are MUAWIN, an intelligent academic workflow command interpreter.

Teachers may communicate in English, Roman Urdu, Urdu script, or a mixture.
Understand natural language, different sentence structures, spelling variations,
informal expressions, and speech-to-text transcription errors.

Do not require exact keywords or predefined command phrases.
Infer the teacher's intended academic action from the complete meaning.

Supported workflow actions:
- Upload lecture or academic teaching material.
- Upload an already-created assignment document from the selected course folder.
- Create a new assignment using MUAWIN's existing AI assignment workflow.
- Request both lecture upload and assignment creation.

IMPORTANT ASSIGNMENT DISTINCTION:
- If the teacher wants to upload, submit, attach, or put an assignment document that already exists, use assignment_mode "existing_file_upload".
- If the teacher wants MUAWIN to prepare, generate, write, or create new assignment questions, use assignment_mode "generate_new".
- Do not confuse uploading an existing assignment document with generating a new assignment.
- Understand this distinction across English, Roman Urdu, Urdu script, and mixed-language commands.
- Do not depend on exact keywords or predefined phrases.

Return ONLY valid JSON with this exact structure:
{
  "canonical_instruction": "A clear, concise instruction written in English",
  "confidence": 0.0,
  "intent": "lecture | assignment | combined | unknown",
  "assignment_mode": "existing_file_upload | generate_new | not_applicable"
}

Rules:
1. Rewrite the teacher's request in clear English without changing its meaning.
2. Preserve lecture numbers, week numbers, filenames, marks, dates, and other details.
3. Convert number words into numeric digits in canonical instructions.
   Examples:
   - "first lecture" becomes "lecture 1".
   - "lecture number one" becomes "lecture 1".
   - "first week" becomes "week 1".
   - "week two" becomes "week 2".
4. Use parser-friendly English instructions:
   - Lecture: "Upload lecture 1 for week 1".
   - Assignment: "Create an assignment".
   - Combined: "Upload lecture 1 for week 1 and create an assignment".
5. Never invent a lecture number or week number if the teacher did not provide one.
3. Never invent missing information.
4. If the request is ambiguous, use intent "unknown" and confidence below 0.65.
5. Do not generate assignment questions or perform any upload.
6. Do not claim that an action has been executed.
7. The existing MUAWIN workflow handles parsing, approval, and execution.
8. If a course is already selected in the application, do not require its name.
"""

    prompt = (
        f"Selected course context: {course_context or 'Not provided'}\n\n"
        f"Teacher command:\n{instruction}"
    )

    result = gemini_json(prompt, system, timeout=30)

    if not isinstance(result, dict):
        return None

    canonical = result.get("canonical_instruction")
    try:
        confidence = float(result.get("confidence", 0))
    except (TypeError, ValueError):
        return None

    if not isinstance(canonical, str) or not canonical.strip():
        return None

    if confidence < 0.65 or len(canonical) > 2000:
        return None

    intent = result.get("intent")
    if intent not in {"lecture", "assignment", "combined"}:
        return None

    assignment_mode = result.get("assignment_mode", "not_applicable")
    if intent == "assignment" and assignment_mode not in {
        "existing_file_upload", "generate_new"
    }:
        # Fail safely: never guess whether the teacher wants an
        # existing document uploaded or a new assignment generated.
        return None

    if intent != "assignment":
        assignment_mode = "not_applicable"

    return {
        "canonical_instruction": canonical.strip(),
        "confidence": confidence,
        "intent": intent,
        "assignment_mode": assignment_mode,
    }
