import io
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# ============================================================
# MUAWIN - MOELLIM LECTURE UPLOAD (BROWSER AUTOMATION)  -  ONE FILE
# ============================================================
#
# Run:    python muawin_lecture.py
# The teacher TYPES one request, e.g.
#     Upload Lecture 5 to CS7 MUAWIN Week 1
#     Upload lecture_test as Lecture 2 to CS7 MUAWIN Week 7
# and then only verifies the review screen (ENTER = approve).
#
# Setup (once):   pip install playwright    +    playwright install chromium
# Next to this file put a ".env" with:
#     MOELLIM_USERNAME=...
#     MOELLIM_PASSWORD=...
#     MOELLIM_BASE_URL=https://moellim.riphah.edu.pk      (optional)
#     MUAWIN_LECTURE_FOLDERS=C:\\Lectures;D:\\Teaching     (optional)
# Google Drive search is optional (token.json + Google packages).
#
# Teacher Request
#   -> Login -> Course -> Edit mode ON -> Week
#   -> Select material (My Computer / Google Drive)
#   -> Preview + Teacher approval
#   -> "+" -> Activity or resource -> File -> Add
#   -> Add... -> Upload a file -> Upload this file
#   -> Name + Description + Display description
#   -> Save and return to course -> Verify -> Log
#
# LLM: OFF | Class Mode: OFF | Assignment Generation: OFF
# ============================================================

# ============================================================
# PATHS
# ============================================================
# Everything (.env, logs, downloaded files, token.json) lives in the SAME folder
# as this file. (Set MUAWIN_HOME to use another folder.)
BASE_DIR = Path(os.getenv("MUAWIN_HOME") or Path(__file__).resolve().parent)
ENV_FILE = BASE_DIR / ".env"
TEMP_DIR = BASE_DIR / "data" / "selected_materials"
LOG_FILE = BASE_DIR / "logs" / "activity_log.jsonl"
TEMP_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


# ============================================================
# ENV
# ============================================================
def load_env():
    """Read .env from this file's folder (then the current folder).
    Real environment variables always win."""
    for env_file in (ENV_FILE, Path.cwd() / ".env"):
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key.strip(), value)


load_env()

MOELLIM_BASE_URL = os.getenv(
    "MOELLIM_BASE_URL", "https://moellim.riphah.edu.pk"
).rstrip("/")
MOELLIM_USERNAME = os.getenv("MOELLIM_USERNAME", "")
MOELLIM_PASSWORD = os.getenv("MOELLIM_PASSWORD", "")
HEADLESS = True


# ============================================================
# HELPERS
# ============================================================
def clean_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def normalize(value):
    return clean_text(value).lower()


def similarity(a, b):
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def pause(seconds=1):
    time.sleep(seconds)


def divider():
    print("-" * 70)


def escape_html(text):
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def first_visible(locator):
    """Return the first VISIBLE element of a locator (or None)."""
    for i in range(locator.count()):
        item = locator.nth(i)
        try:
            if item.is_visible():
                return item
        except Exception:
            pass
    return None


def wait_visible(get_locator, seconds=10):
    """Keep checking until get_locator() has a visible element."""
    end = time.time() + seconds
    while time.time() < end:
        try:
            found = first_visible(get_locator())
            if found:
                return found
        except Exception:
            pass
        time.sleep(0.3)
    return None


def log_activity(entry):
    entry = {"time": datetime.now().isoformat(timespec="seconds"), **entry}
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"✓ Activity logged: {LOG_FILE.name}")


# ============================================================
# REQUEST PARSER
# ============================================================
def parse_request(request):
    request = clean_text(request)

    # Optional heading:  Upload lecture_test as Lecture 2 to CS7 MUAWIN Week 7
    #                    Upload Lecture 2 as "Introduction to Networks" to ...
    heading = None
    quoted = re.search(
        r"\s+(?:as|titled|named|called)\s+[\"\u201c']([^\"\u201d']+)[\"\u201d']",
        request, re.IGNORECASE,
    )
    plain = re.search(
        r"\s+(?:as|titled|named|called)\s+(.+?)(?=\s+(?:to|into)\s+)",
        request, re.IGNORECASE,
    )
    heading_match = quoted or plain
    if heading_match:
        heading = clean_text(heading_match.group(1))
        request = clean_text(
            request[: heading_match.start()] + request[heading_match.end():]
        )

    # the LAST "Week N" is the target week (file names may contain "Week2")
    week_matches = list(re.finditer(r"\bweek\s*(\d+)\b", request, re.IGNORECASE))
    week_match = week_matches[-1] if week_matches else None
    if not week_match:
        raise ValueError("Request mein Week number nahi mila.")
    week_number = int(week_match.group(1))

    # Lecture
    lecture_match = re.search(
        r"\b(?:lecture|lec)\s*\d+(?:\s+[^,]+?)??"
        r"(?=\s+to\s+|\s+into\s+|\s+week\s+|$)",
        request,
        re.IGNORECASE,
    )
    if lecture_match:
        lecture_name = clean_text(lecture_match.group(0))
    else:
        # e.g. "Upload PDC-Week2-1.pdf to CS7 MUAWIN Week 3"
        named = re.match(
            r"^\s*(?:upload|add|put|post)\s+(.+?)\s+(?:to|into)\s+",
            request,
            re.IGNORECASE,
        )
        lecture_name = clean_text(named.group(1)) if named else "Lecture Material"

    # "Lecture 2 PDF" -> "Lecture 2",  "PDC-Week2-1.pdf" -> "PDC-Week2-1"
    lecture_name = re.sub(
        r"(?:\s+(?:pdf|pptx?|docx?|slides?|file))+$", "", lecture_name,
        flags=re.IGNORECASE,
    )
    lecture_name = re.sub(
        r"\.(?:pdf|pptx?|docx?)$", "", lecture_name, flags=re.IGNORECASE
    ).strip() or "Lecture Material"

    # Course
    before_week = request[: week_match.start()].strip()
    course_match = re.search(
        r"\b(?:to|into)\s+(.+?)\s*$", before_week, re.IGNORECASE
    )
    if not course_match:
        raise ValueError("Course name parse nahi ho saka.")
    course_name = clean_text(course_match.group(1))
    course_name = re.sub(
        r"\s+(?:lecture|lec)\s*\d+.*$", "", course_name, flags=re.IGNORECASE
    ).strip()

    return {
        "course": course_name,
        "week": week_number,
        "lecture": lecture_name,
        "heading": heading,
    }


# ============================================================
# MATERIAL SELECTION
# ============================================================

ALLOWED_EXTENSIONS = {
    ".pdf", ".ppt", ".pptx", ".doc", ".docx",
    ".xls", ".xlsx"
}


DRIVE_RESULTS = 20
DRIVE_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]


def build_drive_query(term=""):
    """Drive query: lecture-type files only, optionally filtered by name."""
    query = "trashed = false and (" + " or ".join(
        f"mimeType = '{m}'" for m in DRIVE_MIME_TYPES
    ) + ")"
    term = clean_text(term).replace("\\", "\\\\").replace("'", "\\'")
    if term:
        query += f" and name contains '{term}'"
    return query


# ------------------------------------------------------------
# AUTOMATIC FILE FINDER  (teacher does not browse for the file)
# ------------------------------------------------------------
LECTURE_WORDS = r"(?:lecture|lec|lect)"
SKIP_DIRS = {
    "node_modules", "__pycache__", "venv", ".venv", "appdata",
    "site-packages", ".git", "$recycle.bin",
}


def name_key(text):
    """'Lecture_2-Intro.pdf' -> 'lecture 2 intro'"""
    return normalize(re.sub(r"[_\-.()\[\]]+", " ", text))


def match_rank(filename, lecture_name):
    """How well does this file fit the request?
    3 = same name, 2 = contains the name / same lecture number,
    1 = has all the words (any order), 0 = no match."""
    f = name_key(Path(filename).stem)
    wanted = name_key(lecture_name)
    if not wanted or wanted == "lecture material":
        return 0

    if f.replace(" ", "") == wanted.replace(" ", ""):
        return 3

    number = re.match(rf"{LECTURE_WORDS}\s*0*(\d+)\b", wanted)
    if number:  # "Lecture 2"  ~  Lecture2 / lec_02 / Lecture 2 Intro
        found = re.search(
            rf"\b{LECTURE_WORDS}\s*0*{number.group(1)}\b", f
        )
        return 2 if found else 0

    if wanted in f:
        return 2
    return 1 if all(w in f for w in wanted.split()) else 0


def lecture_matches(filename, lecture_name):
    return match_rank(filename, lecture_name) > 0


def pretty_heading(text):
    """'lecture_test' -> 'Lecture Test',  'Lecture 2' stays as it is."""
    text = clean_text(re.sub(r"_+", " ", text))
    return text.title() if text.islower() else text


def search_folders():
    """Folders searched for lecture files.
    Override in .env:  MUAWIN_LECTURE_FOLDERS=C:\\Lectures;D:\\Teaching"""
    env = os.getenv("MUAWIN_LECTURE_FOLDERS", "")
    folders = [Path(x.strip()) for x in env.split(";") if x.strip()]
    if not folders:
        home = Path.home()
        folders = [home / "Downloads", home / "Documents", home / "Desktop"]
    return folders


def find_local_files(lecture_name, max_depth=3, max_entries=30000):
    found, checked = [], 0
    for folder in search_folders():
        if not folder.exists():
            continue
        base = len(folder.parts)
        for root, dirs, files in os.walk(folder):
            root_path = Path(root)
            if len(root_path.parts) - base >= max_depth:
                dirs[:] = []
            dirs[:] = [
                d for d in dirs
                if d.lower() not in SKIP_DIRS and not d.startswith(".")
            ]
            if TEMP_DIR in root_path.parents or root_path == TEMP_DIR:
                dirs[:] = []
                continue
            for name in files:
                checked += 1
                if checked > max_entries:
                    return found
                if name.startswith("~$"):
                    continue
                if Path(name).suffix.lower() not in ALLOWED_EXTENSIONS:
                    continue
                if lecture_matches(name, lecture_name):
                    path = root_path / name
                    try:
                        found.append(
                            {
                                "name": name,
                                "source": "Computer",
                                "path": path,
                                "modified": path.stat().st_mtime,
                            }
                        )
                    except OSError:
                        pass
    return found


def drive_service_silent():
    """Google Drive WITHOUT any login popup (only if token.json exists)."""
    token_file = BASE_DIR / "token.json"
    if not token_file.exists():
        return None
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        scopes = ["https://www.googleapis.com/auth/drive.readonly"]
        creds = Credentials.from_authorized_user_file(str(token_file), scopes)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            token_file.write_text(creds.to_json(), encoding="utf-8")
        if not creds.valid:
            return None
        return build("drive", "v3", credentials=creds)
    except Exception:
        return None


def find_drive_files(service, lecture_name):
    from datetime import timezone

    files = (
        service.files()
        .list(
            q=build_drive_query(""),
            fields="files(id,name,modifiedTime)",
            orderBy="modifiedTime desc",
            pageSize=100,
        )
        .execute()
        .get("files", [])
    )
    found = []
    for item in files:
        if not lecture_matches(item["name"], lecture_name):
            continue
        try:
            modified = datetime.fromisoformat(
                item["modifiedTime"].replace("Z", "+00:00")
            ).astimezone(timezone.utc).timestamp()
        except Exception:
            modified = 0
        found.append(
            {
                "name": item["name"],
                "source": "Google Drive",
                "drive_id": item["id"],
                "modified": modified,
            }
        )
    return found


def download_drive_file(service, item):
    from googleapiclient.http import MediaIoBaseDownload

    request = service.files().get_media(fileId=item["drive_id"])
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    output_path = TEMP_DIR / Path(item["name"]).name
    output_path.write_bytes(buffer.getvalue())
    return output_path


class MaterialSelector:
    # --------------------------------------------------------
    # AUTOMATIC: find the file from the request itself
    # --------------------------------------------------------
    
    def auto_select(self, lecture_name):
        print(
            f'\nSearching "{lecture_name}" on this computer '
            "and Google Drive..."
        )

        candidates = find_local_files(lecture_name)

        self.service = drive_service_silent()

        if self.service:
            try:
                candidates += find_drive_files(
                    self.service,
                    lecture_name,
                )
            except Exception as exc:
                print(f"Google Drive search skipped: {exc}")
        else:
            print("Google Drive not connected; searching local files only.")

        # Prefer the computer copy when filenames are identical.
        unique = {}

        for item in sorted(
            candidates,
            key=lambda candidate: candidate["source"] != "Computer",
        ):
            unique.setdefault(normalize(item["name"]), item)

        candidates = list(unique.values())

        for item in candidates:
            item["rank"] = match_rank(
                item["name"],
                lecture_name,
            )

        candidates.sort(
            key=lambda candidate: (
                candidate["rank"],
                candidate["modified"],
            ),
            reverse=True,
        )

        self.candidates = candidates

        if not candidates:
            raise FileNotFoundError(
                f"No matching lecture file found for '{lecture_name}'. "
                "Add the file locally or connect Google Drive, then retry."
            )

        best = candidates[0]

        print(
            f'File found: {best["name"]} ({best["source"]})'
        )

        if len(candidates) > 1:
            print(
                f"{len(candidates) - 1} other matching file(s) found. "
                "The best match was selected automatically."
            )

        # Do not fall back to select_material(), because it uses input().
        if best["source"] == "Computer":
            return best["path"]

        try:
            return download_drive_file(
                self.service,
                best,
            )
        except Exception as exc:
            raise RuntimeError(
                f"Could not download '{best['name']}' from Google Drive: "
                f"{exc}"
            ) from exc

    def _materialize(self, item):
        """Computer file -> its path.  Drive file -> download first."""
        if item["source"] == "Computer":
            return item["path"]
        try:
            path = download_drive_file(self.service, item)
            print(f"✓ Downloaded from Google Drive: {path.name}")
            return path
        except Exception as e:
            print(f"! Google Drive download failed: {e}")
            return self.select_material()

    def other_matches(self, current_name):
        return [
            c for c in getattr(self, "candidates", [])
            if c["name"] != current_name
        ]

    def change_file(self, current_name):
        """Teacher pressed 'f': show the other matches first, else browse."""
        others = self.other_matches(current_name)[:8]
        if not others:
            return self.select_material()
        print("\nOther matching files:")
        for i, item in enumerate(others, start=1):
            when = datetime.fromtimestamp(item["modified"]).strftime("%d %b %Y")
            print(f"  {i}. {item['name']}  ({item['source']}, {when})")
        print("  0. Browse computer / search Google Drive")
        while True:
            choice = input("Select file: ").strip()
            if choice == "0":
                return self.select_material()
            if choice.isdigit() and 1 <= int(choice) <= len(others):
                return self._materialize(others[int(choice) - 1])
            print("Invalid selection.")

    # --------------------------------------------------------
    # MANUAL (fallback / "change file")
    # --------------------------------------------------------
    def select_material(self):
        print()
        divider()
        print("LECTURE MATERIAL SELECTION")
        divider()
        print("1. My Computer")
        print("2. Google Drive")
        print("3. Cancel")
        while True:
            choice = input("Select material source [1/2/3]: ").strip()
            if choice == "1":
                return self.select_from_computer()
            if choice == "2":
                return self.select_from_google_drive()
            if choice == "3":
                return None
            print("Invalid choice. Please select 1, 2 or 3.")

    # --------------------------------------------------------
    # MY COMPUTER (native Windows file picker)
    # --------------------------------------------------------
    def select_from_computer(self):
        print()
        print("✓ My Computer selected.")
        print("✓ Opening Windows file picker...")

        if sys.platform != "win32":
            raise RuntimeError("My Computer file picker requires Windows.")

        # -STA is required by Windows Forms.
        powershell_script = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'MUAWIN - Select Lecture Material'
$dialog.Filter = 'Supported files (*.pdf;*.ppt;*.pptx;*.doc;*.docx;*.xls;*.xlsx)|*.pdf;*.ppt;*.pptx;*.doc;*.docx;*.xls;*.xlsx|All files (*.*)|*.*'
$dialog.Multiselect = $false
$dialog.CheckFileExists = $true
$dialog.CheckPathExists = $true
try {
    $result = $dialog.ShowDialog()
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Out.WriteLine($dialog.FileName)
    }
}
finally {
    $dialog.Dispose()
}
"""
        try:
            result = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-STA",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    powershell_script,
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                check=False,
            )
        except FileNotFoundError:
            raise RuntimeError("Windows PowerShell nahi mila.")

        if result.returncode != 0:
            details = clean_text(result.stderr)
            raise RuntimeError(
                "Windows file picker open nahi hua. "
                + (details or "PowerShell error.")
            )

        selected_path = result.stdout.strip()
        if not selected_path:
            print("! File selection cancelled.")
            return None

        file_path = Path(selected_path)
        if not file_path.is_file():
            raise RuntimeError("Selected file accessible nahi hai.")
        if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
            raise RuntimeError(f"Unsupported file type: {file_path.suffix}")

        print(f"✓ Material selected: {file_path.name}")
        return file_path

    # --------------------------------------------------------
    # GOOGLE DRIVE
    # --------------------------------------------------------
    def select_from_google_drive(self):
        print()
        print("✓ Google Drive selected.")

        credentials_file = BASE_DIR / "credentials.json"
        token_file = BASE_DIR / "token.json"

        if not credentials_file.exists():
            print("! credentials.json project root mein required hai.")
            return None

        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaIoBaseDownload
        except ImportError:
            print("! Google Drive packages missing. My Computer use karein.")
            return None

        scopes = ["https://www.googleapis.com/auth/drive.readonly"]
        creds = None

        if token_file.exists():
            try:
                creds = Credentials.from_authorized_user_file(
                    str(token_file), scopes
                )
            except Exception:
                creds = None

        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                token_file.write_text(creds.to_json(), encoding="utf-8")
            except Exception:
                creds = None

        if not creds or not creds.valid:
            try:
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(credentials_file), scopes
                )
                creds = flow.run_local_server(port=0)
                token_file.write_text(creds.to_json(), encoding="utf-8")
            except Exception as e:
                print(f"! Google Drive login failed: {e}")
                return None

        try:
            service = build("drive", "v3", credentials=creds)
        except Exception as e:
            print(f"! Google Drive connect failed: {e}")
            return None

        # Search loop: teacher types part of the file name (Enter = latest files)
        while True:
            print()
            term = input(
                f"Search file name (Enter = latest {DRIVE_RESULTS} files, "
                "0 = Cancel): "
            ).strip()
            if term == "0":
                return None

            try:
                files = (
                    service.files()
                    .list(
                        q=build_drive_query(term),
                        fields="files(id,name,mimeType,modifiedTime,size)",
                        orderBy="modifiedTime desc",
                        pageSize=DRIVE_RESULTS,
                    )
                    .execute()
                    .get("files", [])
                )
            except Exception as e:
                print(f"! Google Drive files fetch failed: {e}")
                return None

            if not files:
                print("! Is naam se koi supported file nahi mili. Dobara search karein.")
                continue

            print()
            divider()
            print("GOOGLE DRIVE FILES")
            divider()
            for index, item in enumerate(files, start=1):
                print(f"{index}. {item.get('name', '')}")
            print()
            print("0. Search again / Cancel")

            try:
                index = int(input("Select file: ").strip())
            except ValueError:
                print("Invalid selection.")
                continue
            if index == 0:
                continue  # back to search (type 0 there to cancel)
            if 1 <= index <= len(files):
                selected = files[index - 1]
                break
            print("Invalid selection.")

        try:
            request = service.files().get_media(fileId=selected["id"])
            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            output_path = TEMP_DIR / Path(selected["name"]).name
            output_path.write_bytes(buffer.getvalue())
            print(f"✓ Material selected: {output_path.name}")
            return output_path
        except Exception as e:
            print(f"! Google Drive download failed: {e}")
            return None


# ============================================================
# BASIC LECTURE PREVIEW (no LLM)
# ============================================================
def prepare_lecture_preview(file_path, lecture_name, heading=None):
    heading = clean_text(heading or "")
    if not heading:
        heading = clean_text(lecture_name)
        if not heading or heading.lower() == "lecture material":
            heading = file_path.stem
        heading = pretty_heading(heading)
    return {
        "heading": heading,
        "description": f"Lecture material for {heading}.",
        "key_points": [],  # filled by the LLM later; no filler text for students
        "auto_description": True,  # follows the heading until teacher edits it
    }


# ============================================================
# TEACHER REVIEW  (the ONE approval screen - human in the loop)
# ============================================================
def teacher_review(draft):
    while True:
        print()
        divider()
        print("TEACHER REVIEW - please verify")
        divider()
        if draft.get("note"):
            print(f"⚠ {draft['note']}")
        if draft.get("course"):
            print(f"Course      : {draft['course']}")
            print(f"Week        : {draft['week']}")
        print(f"File        : {draft.get('file', '')}")
        if draft.get("others"):
            print(f"              (+{draft['others']} aur matching file(s): 'f' dabayein)")
        print(f"Heading     : {draft['heading']}")
        print(f"Description : {draft['description']}")
        if draft["key_points"]:
            print("Key Points  :")
            for i, point in enumerate(draft["key_points"], start=1):
                print(f"   {i}. {point}")
        print()
        divider()
        print("ENTER = Approve & Upload   |   e = Edit text   |   f = Change file   |   n = Cancel")

        choice = input("Your choice: ").strip().lower()

        if choice in ("", "y", "yes", "1"):
            return "approve"
        if choice in ("n", "no", "3"):
            return "reject"
        if choice == "f":
            return "change_file"

        if choice in ("e", "2"):
            print("\nEDIT")
            new_heading = input("New heading (Enter = keep): ").strip()
            if new_heading:
                draft["heading"] = new_heading
                if draft.get("auto_description"):
                    draft["description"] = f"Lecture material for {new_heading}."
            new_description = input("New description (Enter = keep): ").strip()
            if new_description:
                draft["description"] = new_description
                draft["auto_description"] = False
            new_points = input(
                "Key points, comma-separated (Enter = keep): "
            ).strip()
            if new_points:
                draft["key_points"] = [
                    clean_text(x) for x in new_points.split(",") if clean_text(x)
                ]
            continue

        print("Invalid choice.")


# ============================================================
# MOODLE AUTOMATION
# ============================================================
class MoodleAutomation:
    def __init__(self, page):
        self.page = page

    def settle(self, seconds=15, extra=1):
        """Wait for a page load/navigation to finish."""
        try:
            self.page.wait_for_load_state(
                "domcontentloaded", timeout=seconds * 1000
            )
        except PlaywrightTimeoutError:
            pass
        pause(extra)

    # ========================================================
    # LOGIN
    # ========================================================
    def login(self):
        print("\n[1] Logging into live Moellim...")

        if not MOELLIM_USERNAME or not MOELLIM_PASSWORD:
            raise RuntimeError("MOELLIM_USERNAME / MOELLIM_PASSWORD .env mein missing hain.")

        self.page.goto(
            f"{MOELLIM_BASE_URL}/login/index.php", wait_until="domcontentloaded"
        )
        pause(1)

        username = self.page.locator('input[name="username"]')
        if username.count() > 0:  # not already logged in
            self.page.locator('input[name="username"]').first.fill(MOELLIM_USERNAME)
            self.page.locator('input[name="password"]').first.fill(MOELLIM_PASSWORD)
            self.page.locator(
                'button[type="submit"], input[type="submit"]'
            ).first.click()
            self.settle(seconds=30, extra=2)

        if "/login/" in self.page.url:
            raise RuntimeError("Login fail hua (username/password check karein).")

        print(f"✓ Logged in: {self.page.title()}")

    # ========================================================
    # COURSE DISCOVERY
    # ========================================================
    def collect_course_links(self):
        # Dashboard course cards load with JavaScript, so wait for them.
        try:
            self.page.wait_for_selector(
                'a[href*="/course/view.php?id="]', timeout=10000
            )
        except PlaywrightTimeoutError:
            pass

        links = self.page.locator('a[href*="/course/view.php?id="]')
        unique = {}
        for i in range(links.count()):
            try:
                link = links.nth(i)
                href = link.get_attribute("href")
                name = clean_text(link.inner_text())
                name = re.sub(r"^course name\s*", "", name, flags=re.I)
                half = len(name) // 2
                if half and normalize(name[:half]) == normalize(name[half:]):
                    name = clean_text(name[:half])  # "X X" -> "X"
                if href and name:
                    # keep the shortest/cleanest name seen for this course
                    old = unique.get(href)
                    if not old or len(name) < len(old["name"]):
                        unique[href] = {"name": name, "href": href}
            except Exception:
                pass
        return list(unique.values())

    def match_course(self, requested):
        links = self.collect_course_links()
        target = normalize(requested)

        for item in links:  # exact
            if normalize(item["name"]) == target:
                return item

        for item in links:  # contains
            name = normalize(item["name"])
            if target in name or name in target:
                return item

        best, best_score = None, 0
        for item in links:  # similarity
            score = similarity(requested, item["name"])
            if score > best_score:
                best, best_score = item, score
        if best and best_score >= 0.70:
            return best
        return None

    def discover_course(self, requested):
        print("\n[2] Discovering course from LIVE Moellim...")

        urls = [
            f"{MOELLIM_BASE_URL}/my/",
            f"{MOELLIM_BASE_URL}/my/courses.php",
            f"{MOELLIM_BASE_URL}/course/search.php?search={quote(requested)}",
        ]
        for url in urls:
            try:
                self.page.goto(url, wait_until="domcontentloaded")
                pause(1)
                result = self.match_course(requested)
                if result:
                    print(f"✓ Course found: {result['name']}")
                    return result
            except Exception:
                pass

        raise RuntimeError(f"Course not found: {requested}")

    def open_course(self, course):
        print("\n[3] Opening live course...")
        self.page.goto(course["href"], wait_until="domcontentloaded")
        pause(2)
        print(f"✓ Course opened: {self.page.title()}")

    # ========================================================
    # EDIT MODE  (new UI: "Edit mode" toggle in top bar)
    # ========================================================
    def edit_mode_on(self):
        if self.page.locator("body.editing").count() > 0:
            return True
        switch = self.page.locator('input[name="setmode"]')
        return switch.count() > 0 and switch.first.is_checked()

    def wait_edit_mode(self, seconds=15):
        end = time.time() + seconds
        while time.time() < end:
            try:
                if self.edit_mode_on():
                    return True
            except Exception:  # page is reloading
                pass
            time.sleep(0.5)
        return False

    def ensure_edit_mode(self):
        print("\n[4] Ensuring Edit mode is ON...")

        if self.edit_mode_on():
            print("✓ Edit mode is already ON.")
            return

        switch = self.page.locator('input[name="setmode"]')
        if switch.count() == 0:
            raise RuntimeError("Edit mode toggle nahi mila.")

        try:
            switch.first.check(timeout=5000)
        except Exception:
            pass  # Moodle reloads the page right after the toggle

        if not self.wait_edit_mode(15):
            # one fallback: click the toggle itself
            try:
                self.page.locator('input[name="setmode"]').first.click(force=True)
            except Exception:
                pass
            if not self.wait_edit_mode(15):
                raise RuntimeError("Edit mode ON nahi ho saka.")

        self.settle()
        print("✓ Edit mode turned ON.")

    # ========================================================
    # SECTIONS / WEEKS
    # (sections are date based: "16 August - 22 August".
    #  section-0 = General, section-1 = Week 1, ...)
    # ========================================================
    def discover_sections(self):
        sections = []
        nodes = self.page.locator('li[id^="section-"]')
        for i in range(nodes.count()):
            try:
                node = nodes.nth(i)
                section_id = node.get_attribute("id") or ""
                match = re.fullmatch(r"section-(\d+)", section_id)
                if not match:
                    continue
                text = clean_text(node.inner_text())
                date_match = re.search(
                    r"(\d{1,2}\s+[A-Za-z]+\s*-\s*\d{1,2}\s+[A-Za-z]+)", text
                )
                sections.append(
                    {
                        "section_id": section_id,
                        "section_number": int(match.group(1)),
                        "date_range": clean_text(date_match.group(1))
                        if date_match
                        else "",
                    }
                )
            except Exception:
                pass
        sections.sort(key=lambda s: s["section_number"])
        return sections

    def find_week(self, week_number, show=False):
        sections = self.discover_sections()
        if show:
            weekly = [s for s in sections if s["section_number"] > 0]
            print(f"✓ Date-based sections found: {len(weekly)}")
            for s in weekly:
                print(f"    Week {s['section_number']}: {s['date_range']}")
        for s in sections:
            if s["section_number"] == week_number:
                return s
        return None

    def check_week(self, week_number):
        print(f"\n[5] Finding Week {week_number} from LIVE Moellim...")
        section = self.find_week(week_number, show=True)

        if section:
            print(f"✓ Week {week_number} found: {section['date_range']}")
            self.page.locator(f"#{section['section_id']}").scroll_into_view_if_needed()
            pause(1)
            return section

        print(f"! Week {week_number} not found.")
        print("! Teacher approval ke baad naya week (date based) add hoga.")
        return None

    def add_week_until_found(self, week_number):
        print(f"\n[ADD WEEK] Creating missing Week {week_number}...")

        for _ in range(30):
            current = self.find_week(week_number)
            if current:
                print(f"✓ Week {week_number} ready: {current['date_range']}")
                return current

            add_week = first_visible(
                self.page.locator('a[data-action="addSection"]')
            )
            if not add_week:
                raise RuntimeError("Moodle 'Add week' button nahi mila.")
            add_week.scroll_into_view_if_needed()
            add_week.click()  # Moodle adds the next date-based week + reloads
            self.settle(extra=2)

        raise RuntimeError("Week creation safety limit reached.")

    # ========================================================
    # ADD "FILE"
    #   "+"  ->  "Activity or resource"  ->  File  ->  Add
    # ========================================================
    def open_activity_chooser(self, section):
        print("      Opening 'Activity or resource'...")
        section_locator = self.page.locator(f"#{section['section_id']}")
        if section_locator.count() == 0:
            raise RuntimeError(f"{section['section_id']} DOM mein nahi mila.")
        section_locator.scroll_into_view_if_needed()
        pause(0.5)

        # 1) "+" button of this section (last one = end of the section)
        plus = None
        buttons = section_locator.locator('button[data-action="open-addingcontent"]')
        for i in reversed(range(buttons.count())):
            try:
                if buttons.nth(i).is_visible():
                    plus = buttons.nth(i)
                    break
            except Exception:
                pass
        if not plus:
            raise RuntimeError("Section ka '+' (Add content) button nahi mila.")
        plus.scroll_into_view_if_needed()
        plus.click()
        pause(0.7)
        print("      ✓ '+' clicked.")

        # 2) "Activity or resource" item of the dropdown that just opened
        chooser = wait_visible(
            lambda: section_locator.locator(
                'button[data-action="open-chooser"]'
            ),
            seconds=8,
        )
        if not chooser:
            raise RuntimeError("'Activity or resource' option nahi dikha.")
        chooser.click()
        print("      ✓ 'Activity or resource' clicked.")

        # 3) wait for the "Add an activity or resource" popup
        option = wait_visible(
            lambda: self.page.locator('a[data-action="add-chooser-option"]'),
            seconds=15,
        )
        if not option:
            raise RuntimeError("Activity/resource popup open nahi hua.")
        print("      ✓ Activity/resource popup opened.")

    
    def select_resource_type(self, title, label):
        """Select a Moodle resource and wait for its settings form."""
        print(f"      Selecting Moodle '{label}'...")

        options = self.page.locator(
            'a[data-action="add-chooser-option"]'
        )

        wanted = first_visible(
            self.page.locator(
                f'a[data-action="add-chooser-option"][title="{title}"]'
            )
        )

        # Fallback: match the visible option text.
        if not wanted:
            for i in range(options.count()):
                option = options.nth(i)
                try:
                    if (
                        option.is_visible()
                        and normalize(option.inner_text()) == normalize(label)
                    ):
                        wanted = option
                        break
                except Exception:
                    continue

        if not wanted:
            raise RuntimeError(
                f"Moodle '{label}' option was not found in the resource chooser."
            )

        wanted.scroll_into_view_if_needed()
        wanted.click()

        # Wait briefly for the chooser to select the resource.
        add_button = self.page.locator(
            'button[data-action="add-selected-chooser-option"]'
        ).filter(visible=True)

        try:
            add_button.first.wait_for(state="visible", timeout=10000)
        except PlaywrightTimeoutError:
            raise RuntimeError(
                f"The Add button did not become visible after selecting '{label}'."
            )

        add_button.first.click()

        # Do not rely exclusively on a URL change. The form is the real
        # indicator that the resource settings page has opened.
        try:
            self.page.locator("#id_name").wait_for(
                state="visible",
                timeout=30000,
            )
        except PlaywrightTimeoutError:
            current_url = self.page.url

            # Collect useful diagnostics without exposing credentials.
            try:
                page_title = self.page.title()
            except Exception:
                page_title = "(unavailable)"

            try:
                visible_text = self.page.locator("body").inner_text(
                    timeout=3000
                )[:1500]
            except Exception:
                visible_text = "(page text unavailable)"

            raise RuntimeError(
                f"'{label}' settings form did not appear. "
                f"Current URL: {current_url!r}; "
                f"Page title: {page_title!r}; "
                f"Visible page text: {visible_text!r}"
            )

        print(f"      ✓ 'New {label}' settings form opened.")


    def select_file_resource(self):
        self.select_resource_type("Add a new File", "File")


    # ========================================================
    # UPLOAD  ("Add..." -> File picker -> Upload a file)
    # ========================================================
    def upload_file(self, file_path):
        print("\n[UPLOAD] Uploading selected material...")

        # 1) "Add..." button of the "Select files" box
        # The Moodle filemanager loads with JavaScript AFTER the page opens,
        # so wait (up to 30s) until its toolbar button is really visible.
        add_btn = wait_visible(
            lambda: self.page.locator(
                ".filemanager .fp-btn-add a, .fp-btn-add a, "
                'a[title="Add..."]'
            ),
            seconds=30,
        )
        if not add_btn:
            raise RuntimeError("Filemanager ka 'Add...' button nahi mila.")
        add_btn.scroll_into_view_if_needed()
        pause(0.5)
        add_btn.click()
        print("      ✓ File picker opened.")

        # 2) "Upload a file" in the picker's left menu
        repo = wait_visible(
            lambda: self.page.locator("span.fp-repo-name").filter(
                has_text="Upload a file"
            ),
            seconds=10,
        )
        if not repo:
            raise RuntimeError("'Upload a file' option nahi mila.")
        repo.click()
        pause(1)

        # 3) choose the file
        file_input = self.page.locator('input[name="repo_upload_file"]')
        if file_input.count() == 0:
            raise RuntimeError("Upload file input nahi mila.")
        file_input.first.set_input_files(str(file_path))
        print(f"      ✓ File chosen: {file_path.name}")

        # 4) "Upload this file"
        upload_btn = first_visible(self.page.locator("button.fp-upload-btn"))
        if not upload_btn:
            raise RuntimeError("'Upload this file' button nahi mila.")
        upload_btn.click()

        # 5) wait until the file shows up inside "Select files"
        try:
            self.page.wait_for_selector(".filemanager .fp-file", timeout=60000)
        except PlaywrightTimeoutError:
            raise RuntimeError("File upload complete nahi hui.")
        pause(1)
        print("      ✓ File uploaded.")

    # ========================================================
    # NAME + DESCRIPTION + DISPLAY DESCRIPTION
    # ========================================================
    def fill_description(self, description, key_points):
        html = f"<p>{escape_html(description)}</p>"
        if key_points:
            html += "<p><strong>Key Points:</strong></p><ul>"
            for point in key_points:
                html += f"<li>{escape_html(point)}</li>"
            html += "</ul>"

        # TinyMCE editor (lives inside an iframe)
        body = self.page.frame_locator("#id_introeditor_ifr").locator("body")
        try:
            body.wait_for(timeout=10000)
            body.evaluate(
                """(el, html) => {
                    el.innerHTML = html;
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                }""",
                html,
            )
        except Exception:
            print("      ! TinyMCE editor nahi mila, textarea use ho raha hai.")

        # Backup: the real (hidden) textarea that Moodle submits
        self.page.locator("#id_introeditor").evaluate(
            """(el, html) => {
                el.value = html;
                el.dispatchEvent(new Event('change', {bubbles: true}));
            }""",
            html,
        )

    def fill_file_settings(self, draft):
        print("\n[SETTINGS] Filling File settings...")

        self.page.locator("#id_name").fill(draft["heading"])
        print("      ✓ Name filled.")

        self.fill_description(draft["description"], draft["key_points"])
        print("      ✓ Description filled.")

        # NOTE: there is also a hidden input with the same name, so use the id.
        checkbox = self.page.locator("#id_showdescription")
        checkbox.scroll_into_view_if_needed()
        if not checkbox.is_checked():
            checkbox.check()
        print("      ✓ 'Display description on course page' checked.")

    # ========================================================
    # SAVE
    # ========================================================
    def save_resource(self):
        print("\n[SAVE] Saving File resource...")

        self.page.locator("#id_submitbutton2").click()  # Save and return to course
        try:
            self.page.wait_for_url(re.compile(r"/course/view\.php"), timeout=30000)
        except PlaywrightTimeoutError:
            raise RuntimeError(
                "Save nahi hua (form mein koi required field/validation error ho sakta hai)."
            )
        self.settle(extra=2)
        print("      ✓ Resource saved.")

    # ========================================================
    # VERIFY
    # ========================================================
    def count_name_in_section(self, week_number, name):
        """How many times `name` appears in the week's text right now."""
        section = self.find_week(week_number)
        if not section:
            return 0
        text = self.page.locator(f"#{section['section_id']}").inner_text()
        return normalize(text).count(normalize(name))

    def verify_same_section(self, week_number, expected_name, expected_file,
                            count_before):
        print(f"\n[VERIFY] Verifying SAME Week {week_number}...")

        self.page.reload(wait_until="domcontentloaded")
        pause(2)

        section = self.find_week(week_number)
        if not section:
            raise RuntimeError(f"Week {week_number} verification ke waqt nahi mila.")

        text = clean_text(self.page.locator(f"#{section['section_id']}").inner_text())
        count_after = normalize(text).count(normalize(expected_name))

        # Strict: the new resource must have ADDED a new appearance of its name.
        # (Old items with the same name/file cannot cause a false "verified".)
        if count_after > count_before:
            print("\n✓ VERIFIED IN SAME SECTION")
            print(f"  Week     : {week_number}")
            print(f"  Section  : {section['date_range']}")
            print(f"  Resource : {expected_name}")
            print(f"  File     : {expected_file}")
            return True

        print("\nTarget section content:")
        print(text[-3000:])
        raise RuntimeError("Naya resource SAME Week mein nazar nahi aaya.")

    # ========================================================
    # FULL UPLOAD WORKFLOW
    # ========================================================
    
    
    
    def upload_approved_lecture(self, week_number, file_path, draft):
        """Upload a lecture only when its heading is not already present."""

        # Refresh the course page after teacher approval.
        self.page.reload(wait_until="domcontentloaded")
        pause(2)

        section = self.find_week(week_number)
        if not section:
            section = self.add_week_until_found(week_number)

        heading = draft["heading"]

        # Prevent a potentially duplicate upload.
        count_before = self.count_name_in_section(week_number, heading)

        if count_before > 0:
            raise RuntimeError(
                f"Upload cancelled: a resource matching the lecture heading "
                f"'{heading}' already appears in Week {week_number}. "
                "Please verify the existing resource in Moellim before "
                "attempting another upload."
            )

        # Upload the lecture.
        self.open_activity_chooser(section)
        self.select_file_resource()
        self.upload_file(file_path)
        self.fill_file_settings(draft)
        self.save_resource()

        # Verify that the resource appears in the intended week.
        return self.verify_same_section(
            week_number=week_number,
            expected_name=heading,
            expected_file=file_path.name,
            count_before=count_before,
        )
# ============================================================
# MAIN
# ============================================================
def launch_browser(p):
    """Shared by all workflows. Visible browser opens maximized."""
    if HEADLESS:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
    else:
        # fits the teacher's own screen (no fixed size that can overflow it)
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        context = browser.new_context(no_viewport=True)
    return browser, context


def main():
    print()
    print("=" * 70)
    print("MUAWIN - MOELLIM LECTURE UPLOAD AUTOMATION")
    print("=" * 70)
    print("LLM: OFF | Automation: PLAYWRIGHT | Browser: VISIBLE")

    if not (MOELLIM_USERNAME and MOELLIM_PASSWORD):
        print("\nERROR: Moellim username/password nahi mile.")
        print(f"Is file ke saath ye .env banayein/rakhein:\n  {ENV_FILE}")
        print("Us mein:  MOELLIM_USERNAME=...   aur   MOELLIM_PASSWORD=...")
        print("(Windows mein file ka naam '.env' hona chahiye, '.env.txt' nahi.)")
        return

    print("\n[0] Teacher Request")
    print('    Example: Upload Lecture 5 to CS7 MUAWIN Week 1')
    request = input("Teacher Request: ").strip()
    if not request:
        print("No request entered.")
        return

    try:
        parsed = parse_request(request)
    except Exception as e:
        print(f"\nERROR: {e}")
        return

    print("\nParsed Request:")
    print(f"Course   : {parsed['course']}")
    print(f"Week     : {parsed['week']}")
    print(f"Lecture  : {parsed['lecture']}")
    if parsed.get("heading"):
        print(f"Heading  : {parsed['heading']}")

    log = {"request": request, **parsed}

    with sync_playwright() as p:
        browser, context = launch_browser(p)
        page = context.new_page()
        moodle = MoodleAutomation(page)

        try:
            moodle.login()

            course = moodle.discover_course(parsed["course"])
            print(f"\n✓ Matched course: {course['name']}")
            print(f"✓ Live course URL: {course['href']}")
            log["course_matched"] = course["name"]

            moodle.open_course(course)
            moodle.ensure_edit_mode()
            target_week = moodle.check_week(parsed["week"])
            week_note = ""
            if not target_week:
                last = max(
                    (s["section_number"] for s in moodle.discover_sections()),
                    default=0,
                )
                new_weeks = list(range(last + 1, parsed["week"] + 1))
                week_note = (
                    "Moellim mein ye naye weeks (date based) ban jayenge: "
                    + ", ".join(f"Week {w}" for w in new_weeks)
                )

            # ---------------- FIND FILE (automatic) ----------------
            print("\n[6] Finding lecture material...")
            selector = MaterialSelector()
            file_path = selector.auto_select(parsed["lecture"])
            if not file_path:
                print("\n! Material selection cancelled. No Moodle upload performed.")
                log["status"] = "cancelled"
                log_activity(log)
                return

            # ---------------- ONE REVIEW / APPROVAL ----------------
            draft = prepare_lecture_preview(
                file_path, parsed["lecture"], parsed.get("heading")
            )
            draft["note"] = week_note
            draft["course"] = course["name"]
            draft["week"] = parsed["week"]
            draft["file"] = file_path.name
            draft["others"] = len(selector.other_matches(file_path.name))

            print("\n[7] Teacher Review")
            while True:
                decision = teacher_review(draft)
                if decision == "change_file":
                    new_file = selector.change_file(file_path.name)
                    if new_file:
                        file_path = new_file
                        draft["file"] = file_path.name
                        draft["others"] = len(
                            selector.other_matches(file_path.name)
                        )
                    continue
                break

            log["file"] = file_path.name
            if decision == "reject":
                print("\n! Teacher rejected/cancelled. No Moodle upload performed.")
                log["status"] = "rejected"
                log_activity(log)
                return
            print("\n✓ Teacher approved lecture.")

            # ---------------- UPLOAD ----------------
            print("\n[8] Starting approved Moodle upload...")
            verified = moodle.upload_approved_lecture(
                week_number=parsed["week"], file_path=file_path, draft=draft
            )

            if verified:
                print("\n" + "=" * 70)
                print("MUAWIN WORKFLOW COMPLETED SUCCESSFULLY")
                print("=" * 70)
                print(f"Course  : {course['name']}")
                print(f"Week    : {parsed['week']}")
                print(f"Lecture : {draft['heading']}")
                print(f"File    : {file_path.name}")
                print("\n✓ Uploaded\n✓ Saved\n✓ Verified in SAME Week")
                log["heading"] = draft["heading"]
                log["status"] = "success"
                log_activity(log)

        except Exception as e:
            print("\n" + "=" * 70)
            print("MUAWIN WORKFLOW FAILED")
            print("=" * 70)
            print(f"\nERROR TYPE: {type(e).__name__}")
            print(f"ERROR: {e}")
            log["status"] = "failed"
            log["error"] = str(e)
            log_activity(log)
            try:
                screenshot = BASE_DIR / "muawin_error.png"
                page.screenshot(path=str(screenshot), full_page=True)
                print(f"\nDebug screenshot:\n{screenshot}")
            except Exception:
                pass
        finally:
            print("\nBrowser automation finished.")
            if log.get("status") == "failed":
                input("Press ENTER to close browser...")  # time to inspect
            else:
                pause(4)  # closes by itself
            browser.close()


if __name__ == "__main__":
    main()