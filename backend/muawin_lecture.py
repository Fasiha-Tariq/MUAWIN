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
HEADLESS = False


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
    print(f"Ã¢Å“â€œ Activity logged: {LOG_FILE.name}")


# ============================================================
# REQUEST PARSER
# ============================================================
def parse_request(request):
    request = clean_text(request)

    # Optional teacher-provided heading.
    heading = None
    quoted = re.search(
        r'\s+(?:as|titled|named|called)\s+["?\']([^"?\']+)["?\']',
        request,
        re.IGNORECASE,
    )
    plain = re.search(
        r'\s+(?:as|titled|named|called)\s+(.+?)(?=\s+(?:to|into)\s+)',
        request,
        re.IGNORECASE,
    )
    heading_match = quoted or plain
    if heading_match:
        heading = clean_text(heading_match.group(1))
        request = clean_text(
            request[:heading_match.start()] + request[heading_match.end():]
        )

    # Explicit week always wins. Otherwise Lecture N defaults to Week N.
    week_matches = list(
        re.finditer(r"\bweek\s*(\d+)\b", request, re.IGNORECASE)
    )
    week_match = week_matches[-1] if week_matches else None

    lecture_number_match = re.search(
        r"\b(?:lecture|lec)\s*(\d+)\b",
        request,
        re.IGNORECASE,
    )

    if week_match:
        week_number = int(week_match.group(1))
    elif lecture_number_match:
        week_number = int(lecture_number_match.group(1))
    else:
        raise ValueError(
            "Lecture/week number nahi mila. Example: Lecture 2 upload karo."
        )

    # Keep numbered lecture identity clean for matching course-folder files.
    if lecture_number_match:
        lecture_name = f"Lecture {lecture_number_match.group(1)}"
    else:
        # Legacy named-file command, e.g.:
        # Upload Marketing_Chapter.pdf to CS7 MUAWIN Week 6
        named = re.match(
            r"^\s*(?:upload|add|put|post)\s+(.+?)\s+(?:to|into)\s+",
            request,
            re.IGNORECASE,
        )
        lecture_name = (
            clean_text(named.group(1))
            if named else "Lecture Material"
        )

    lecture_name = re.sub(
        r"(?:\s+(?:pdf|pptx?|docx?|slides?|file))+$",
        "",
        lecture_name,
        flags=re.IGNORECASE,
    )
    lecture_name = re.sub(
        r"\.(?:pdf|pptx?|docx?)$",
        "",
        lecture_name,
        flags=re.IGNORECASE,
    ).strip() or "Lecture Material"

    # Course is optional here; the selected course is supplied by the UI.
    before_week = request[:week_match.start()].strip() if week_match else request
    course_match = re.search(
        r"\b(?:to|into)\s+(.+?)\s*$",
        before_week,
        re.IGNORECASE,
    )
    course_name = clean_text(course_match.group(1)) if course_match else None

    # Remove accidental lecture wording from a legacy course capture.
    if course_name:
        course_name = re.sub(
            r"\s+(?:lecture|lec)\s*\d+.*$",
            "",
            course_name,
            flags=re.IGNORECASE,
        ).strip() or None

    return {
        "course": course_name,
        "week": week_number,
        "lecture": lecture_name,
        "heading": heading,
    }


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
    """Strictly match the requested lecture number or exact title."""
    f = name_key(Path(filename).stem)
    wanted = name_key(lecture_name)

    if not wanted or wanted == "lecture material":
        return 0

    number = re.search(
        rf"\b{LECTURE_WORDS}\s*0*(\d+)\b",
        wanted,
    )

    if number:
        requested_number = int(number.group(1))
        found = re.search(
            rf"\b{LECTURE_WORDS}\s*0*(\d+)\b",
            f,
        )
        if not found or int(found.group(1)) != requested_number:
            return 0
        return 3

    if f == wanted:
        return 3

    if wanted in f:
        return 2

    return 0


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


def find_local_files(lecture_name, max_depth=3, max_entries=30000, folder=None):
    found, checked = [], []

    folders = [Path(folder).expanduser()] if folder else search_folders()

    if folder and not folders[0].is_dir():
        raise FileNotFoundError(
            f"Saved course lecture folder does not exist: {folders[0]}"
        )

    for base_folder in folders:
        if not base_folder.is_dir():
            continue

        base = len(base_folder.parts)

        for root, dirs, files in os.walk(base_folder):
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
                checked.append(name)
                if len(checked) > max_entries:
                    return found

                if name.startswith("~$"):
                    continue
                if Path(name).suffix.lower() not in ALLOWED_EXTENSIONS:
                    continue

                if lecture_matches(name, lecture_name):
                    path = root_path / name
                    try:
                        found.append({
                            "name": name,
                            "source": "Computer",
                            "path": path,
                            "modified": path.stat().st_mtime,
                        })
                    except OSError:
                        pass

    return found


def drive_service_silent():
    """Return an authenticated Drive service, refreshing token when possible.

    OAuth files are deliberately kept in backend/. Never log token contents.
    """
    token_file = BASE_DIR / os.getenv("GOOGLE_TOKEN_FILE", "token.json")
    if not token_file.is_absolute():
        token_file = BASE_DIR / token_file
    if not token_file.exists():
        print(f"[Google Drive] OAuth token not found: {token_file.name}")
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
            print("[Google Drive] Saved token is invalid. Reconnect Google Drive.")
            return None
        service = build("drive", "v3", credentials=creds, cache_discovery=False)
        service.about().get(fields="user(emailAddress)").execute()
        print("[Google Drive] Connected successfully.")
        return service
    except ImportError as exc:
        print(f"[Google Drive] Required packages missing: {exc}")
    except Exception as exc:
        print(f"[Google Drive] Connection failed: {type(exc).__name__}: {exc}")
    return None


def connect_google_drive_interactive():
    """Run the local OAuth consent flow and persist a read-only Drive token."""
    credentials_file = BASE_DIR / os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
    token_file = BASE_DIR / os.getenv("GOOGLE_TOKEN_FILE", "token.json")
    if not credentials_file.is_absolute():
        credentials_file = BASE_DIR / credentials_file
    if not token_file.is_absolute():
        token_file = BASE_DIR / token_file
    if not credentials_file.exists():
        raise FileNotFoundError("backend/credentials.json is missing. Add your own Google OAuth Desktop credentials first.")
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    scopes = ["https://www.googleapis.com/auth/drive.readonly"]
    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), scopes)
    creds = flow.run_local_server(port=0, open_browser=True, access_type="offline", prompt="consent")
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(creds.to_json(), encoding="utf-8")
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    service.about().get(fields="user(emailAddress)").execute()
    return service


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
    
    def auto_select(self, lecture_name, local_folder=None, drive_folder_id=None):
        if not local_folder:
            raise RuntimeError("No course-specific lecture folder is saved. Select and save it in Course Setup first.")
        if drive_folder_id:
            raise RuntimeError("Course-specific Google Drive folder selection is not yet configured.")
        print(f'`nSearching "{lecture_name}" only in the selected course folder...')
        candidates = find_local_files(lecture_name, folder=local_folder)
        print("Searching only the selected local course folder.")

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
            print(f"Ã¢Å“â€œ Downloaded from Google Drive: {path.name}")
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
        print("Ã¢Å“â€œ My Computer selected.")
        print("Ã¢Å“â€œ Opening Windows file picker...")

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

        print(f"Ã¢Å“â€œ Material selected: {file_path.name}")
        return file_path

    # --------------------------------------------------------
    # GOOGLE DRIVE
    # --------------------------------------------------------
    def select_from_google_drive(self):
        print()
        print("Ã¢Å“â€œ Google Drive selected.")

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
            print(f"Ã¢Å“â€œ Material selected: {output_path.name}")
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
            print(f"Ã¢Å¡Â  {draft['note']}")
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
    def login(self, username=None, password=None):
        """Log in to Moellim and verify the authenticated session."""

        print("\n[1] Logging into live Moellim...")

        login_username = (username or MOELLIM_USERNAME or "").strip()
        login_password = password or MOELLIM_PASSWORD

        if not login_username or not login_password:
            raise RuntimeError(
                "Moellim username or password is missing. "
                "Check the environment configuration."
            )

        self.page.goto(
            f"{MOELLIM_BASE_URL}/login/index.php",
            wait_until="domcontentloaded",
            timeout=60000,
        )

        username_field = self.page.locator('input[name="username"]')

        try:
            username_field.wait_for(state="visible", timeout=30000)
        except PlaywrightTimeoutError:
            # The session may already be authenticated.
            authenticated = (
                self.page.locator(
                    'a[href*="logout"], '
                    'a[href*="login/logout.php"], '
                    '#user-menu-toggle, '
                    '.usermenu'
                ).count() > 0
            )

            if authenticated:
                print(f"Logged in: {self.page.title()}")
                return

            raise RuntimeError(
                "Moellim login form could not be found. "
                f"Current URL: {self.page.url}"
            )

        password_field = self.page.locator('input[name="password"]')

        if password_field.count() == 0:
            raise RuntimeError(
                "The password field was not found on the Moellim login page."
            )

        username_field.first.fill(login_username)
        password_field.first.fill(login_password)

        submit_button = self.page.locator(
            'button[type="submit"], input[type="submit"]'
        )

        if submit_button.count() == 0:
            raise RuntimeError(
                "The login submit button was not found."
            )

        submit_button.first.click()

        # Wait for Moodle to process the login response.
        # Do not rely on the URL alone.
        for _ in range(60):
            self.page.wait_for_timeout(1000)

            current_url = self.page.url.lower()

            # Check common Moodle login error containers.
            error_selectors = [
                "#loginerrormessage",
                ".loginerrors",
                ".alert-danger",
                '[role="alert"]',
            ]

            login_error = ""

            for selector in error_selectors:
                try:
                    locator = self.page.locator(selector)
                    if locator.count() > 0 and locator.first.is_visible():
                        login_error = clean_text(
                            locator.first.inner_text()
                        )
                        if login_error:
                            break
                except Exception:
                    continue

            if login_error:
                raise RuntimeError(
                    f"Moellim rejected the login request: {login_error}"
                )

            # Detect a successful authenticated Moodle session.
            success_selectors = [
                'a[href*="logout"]',
                'a[href*="login/logout.php"]',
                '#user-menu-toggle',
                '.usermenu',
            ]

            for selector in success_selectors:
                try:
                    locator = self.page.locator(selector)
                    if locator.count() > 0 and locator.first.is_visible():
                        print(
                            f"Successfully logged in to Moellim: "
                            f"{self.page.title()}"
                        )
                        return
                except Exception:
                    continue

            # A non-login page with no login form is another
            # indication that Moodle completed authentication.
            if (
                "/login/" not in current_url
                and self.page.locator('input[name="username"]').count() == 0
            ):
                print(
                    f"Successfully logged in to Moellim: "
                    f"{self.page.title()}"
                )
                return

        # Login did not complete. Collect useful diagnostic details.
        try:
            page_text = clean_text(
                self.page.locator("body").inner_text(timeout=5000)
            )[:2000]
        except Exception:
            page_text = "Page text could not be retrieved."

        raise RuntimeError(
            "Moellim login could not be verified after submitting the form. "
            f"Current URL: {self.page.url}. "
            f"Page title: {self.page.title()}. "
            f"Visible page text: {page_text}"
        )

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
                    print(f"Ã¢Å“â€œ Course found: {result['name']}")
                    return result
            except Exception:
                pass

        raise RuntimeError(f"Course not found: {requested}")

    def open_course(self, course):
        print("\n[3] Opening live course...")
        self.page.goto(course["href"], wait_until="domcontentloaded")
        pause(2)
        print(f"Ã¢Å“â€œ Course opened: {self.page.title()}")

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
            print("Ã¢Å“â€œ Edit mode is already ON.")
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
        print("Ã¢Å“â€œ Edit mode turned ON.")

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
            print(f"Ã¢Å“â€œ Date-based sections found: {len(weekly)}")
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
            print(f"Ã¢Å“â€œ Week {week_number} found: {section['date_range']}")
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
                print(f"Ã¢Å“â€œ Week {week_number} ready: {current['date_range']}")
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
        print("      Ã¢Å“â€œ '+' clicked.")

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
        print("      Ã¢Å“â€œ 'Activity or resource' clicked.")

        # 3) wait for the "Add an activity or resource" popup
        option = wait_visible(
            lambda: self.page.locator('a[data-action="add-chooser-option"]'),
            seconds=15,
        )
        if not option:
            raise RuntimeError("Activity/resource popup open nahi hua.")
        print("      Ã¢Å“â€œ Activity/resource popup opened.")

    

    def select_resource_type(self, title, label):
        """Select a Moodle resource and detect either direct or chooser form."""

        print(f"      Selecting Moodle '{label}'...")

        options = self.page.locator('a[data-action="add-chooser-option"]')
        wanted = first_visible(
            self.page.locator(
                'a[data-action="add-chooser-option"]'
                f'[title="{title}"]'
            )
        )

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
        print(f"      Resource '{label}' selected.")

        form_name = self.page.locator("#id_name")

        # Some Moodle versions navigate directly to modedit.php.
        try:
            form_name.wait_for(state="visible", timeout=10000)
            print(f"      Direct '{label}' settings form opened.")
            return
        except PlaywrightTimeoutError:
            pass

        # Otherwise, the chooser may display a separate Add action.
        add_action = self.page.get_by_role("button", name="Add", exact=True)

        try:
            add_action.first.wait_for(state="visible", timeout=10000)
        except PlaywrightTimeoutError:
            raise RuntimeError(
                f"Neither the '{label}' settings form nor the Moodle Add action "
                f"appeared. URL: {self.page.url!r}"
            )

        add_ready = False
        for _ in range(20):
            try:
                if add_action.first.is_visible() and add_action.first.is_enabled():
                    add_ready = True
                    break
            except Exception:
                pass
            self.page.wait_for_timeout(500)

        if not add_ready:
            raise RuntimeError(
                f"Moodle Add action appeared but was not enabled for '{label}'."
            )

        add_action.first.scroll_into_view_if_needed()
        add_action.first.click()
        print(f"      Moodle Add action clicked for '{label}'.")

        try:
            form_name.wait_for(state="visible", timeout=30000)
        except PlaywrightTimeoutError:
            raise RuntimeError(
                f"'{label}' settings form did not appear after Add. "
                f"URL: {self.page.url!r}"
            )

        print(f"      'New {label}' settings form opened.")

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
        print("      Ã¢Å“â€œ File picker opened.")

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
        print(f"      Ã¢Å“â€œ File chosen: {file_path.name}")

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
        print("      Ã¢Å“â€œ File uploaded.")

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
        print("      Ã¢Å“â€œ Name filled.")

        self.fill_description(draft["description"], draft["key_points"])
        print("      Ã¢Å“â€œ Description filled.")

        # NOTE: there is also a hidden input with the same name, so use the id.
        checkbox = self.page.locator("#id_showdescription")
        checkbox.scroll_into_view_if_needed()
        if not checkbox.is_checked():
            checkbox.check()
        print("      Ã¢Å“â€œ 'Display description on course page' checked.")

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
        print("      Ã¢Å“â€œ Resource saved.")

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
            print("\nÃ¢Å“â€œ VERIFIED IN SAME SECTION")
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


def verify_course_lecture_records(course_name, uploads):
    """
    Read-only check of saved lecture headings/files in their exact Moellim weeks.
    Returns present/missing/unknown per history record. Never uploads or edits Moodle.
    """
    if not MOELLIM_USERNAME or not MOELLIM_PASSWORD:
        raise RuntimeError("Moellim credentials are not configured.")

    results = []

    with sync_playwright() as p:
        browser, context = launch_browser(p)
        try:
            page = context.new_page()
            moodle = MoodleAutomation(page)
            moodle.login()
            course = moodle.discover_course(course_name)
            moodle.open_course(course)

            for upload in uploads:
                record_id = int(upload["id"])
                try:
                    week = int(upload["week"])
                    section = moodle.find_week(week)
                    if not section:
                        results.append({"id": record_id, "status": "unknown",
                                        "reason": f"Week {week} section was not found."})
                        continue

                    section_text = page.locator(
                        f"#{section['section_id']}"
                    ).inner_text(timeout=10000)

                    def normalized(value):
                        return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())

                    content = normalized(section_text)
                    candidates = [
                        normalized(upload.get("title")),
                        normalized(upload.get("file_name")),
                    ]
                    candidates = [value for value in candidates if len(value) >= 5]

                    if not candidates:
                        results.append({"id": record_id, "status": "unknown",
                                        "reason": "No reliable title or filename to verify."})
                    elif any(value in content for value in candidates):
                        results.append({"id": record_id, "status": "present"})
                    else:
                        results.append({"id": record_id, "status": "missing"})
                except Exception as exc:
                    results.append({"id": record_id, "status": "unknown",
                                    "reason": str(exc)})

        finally:
            browser.close()

    return results



def scan_live_course_lecture_weeks(course_name):
    """Read-only scan of weekly Moellim sections for uploaded lecture resources and current week."""
    if not MOELLIM_USERNAME or not MOELLIM_PASSWORD:
        raise RuntimeError("Moellim credentials are not configured.")

    weeks_with_lecture = []
    checked_weeks = []
    sections_info = []
    current_week = None

    with sync_playwright() as p:
        browser, context = launch_browser(p)
        try:
            page = context.new_page()
            moodle = MoodleAutomation(page)
            moodle.login()
            course = moodle.discover_course(course_name)
            moodle.open_course(course)

            for section in moodle.discover_sections():
                week = int(section["section_number"])
                if week <= 0:
                    continue

                locator = page.locator(f"#{section['section_id']}")
                locator.wait_for(state="attached", timeout=10000)
                checked_weeks.append(week)

                # Detect Moellim's highlighted "Current week" section
                is_current = False
                try:
                    cls = (locator.get_attribute("class") or "").lower().split()
                    if "current" in cls:
                        is_current = True
                    elif locator.locator(".currentbadge, .badge:has-text('Current week')").count() > 0:
                        is_current = True
                    else:
                        header_text = clean_text(
                            locator.locator(".sectionname, h3, .course-section-header").first.inner_text(timeout=2000)
                        )
                        if "current week" in header_text.lower():
                            is_current = True
                except Exception:
                    pass

                if is_current:
                    current_week = week

                sections_info.append({
                    "week": week,
                    "heading": section.get("date_range") or "",
                    "is_current": is_current,
                })

                selectors = [
                    "li.activity.modtype_resource",
                    ".activity.modtype_resource",
                    'a[href*="/mod/resource/view.php"]',
                    'a[href*="/pluginfile.php"]',
                ]
                found = False
                for selector in selectors:
                    try:
                        if locator.locator(selector).count() > 0:
                            found = True
                            break
                    except Exception:
                        pass

                if found:
                    weeks_with_lecture.append(week)
        finally:
            browser.close()

    return {
        "checked_weeks": sorted(set(checked_weeks)),
        "weeks_with_lecture": sorted(set(weeks_with_lecture)),
        "has_any_lecture": bool(weeks_with_lecture),
        "current_week": current_week,
        "sections": sections_info,
    }




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
            print(f"\nÃ¢Å“â€œ Matched course: {course['name']}")
            print(f"Ã¢Å“â€œ Live course URL: {course['href']}")
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
            print("\nÃ¢Å“â€œ Teacher approved lecture.")

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
                print("\nÃ¢Å“â€œ Uploaded\nÃ¢Å“â€œ Saved\nÃ¢Å“â€œ Verified in SAME Week")
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



