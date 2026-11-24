import os
import json
import asyncio
import base64
from contextlib import suppress
from pathlib import Path
from typing import Optional
from uuid import uuid4

import websockets
from dotenv import load_dotenv
from fastapi import APIRouter, WebSocket, WebSocketDisconnect


# =========================================================
# ENVIRONMENT
# =========================================================

ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

API_KEY = os.getenv("GEMINI_API_KEY")

MODEL = "gemini-3.5-transcribe-live"

SESSION_ROTATION_SECONDS = float(
    os.getenv(
        "GEMINI_SESSION_ROTATION_SECONDS",
        "480",
    )
)

if SESSION_ROTATION_SECONDS <= 0:
    SESSION_ROTATION_SECONDS = 480

# =========================================================
# GEMINI LIVE WEBSOCKET
# =========================================================

GEMINI_WS_URL = (
    "wss://generativelanguage.googleapis.com/"
    "ws/google.ai.generativelanguage.v1beta."
    "GenerativeService.BidiGenerateContent"
)


# =========================================================
# FASTAPI APP
# =========================================================

router = APIRouter(tags=["Live Transcription"])


@router.get("/api/transcription/health")
async def health():
    return {
        "status": "ok" if API_KEY else "unconfigured",
        "service": "muawin-standalone-live-transcription",
        "model": MODEL,
    }


# =========================================================
# GEMINI LIVE SESSION
# =========================================================

class GeminiLiveSession:
    """
    Manages one Gemini Live WebSocket connection.

    The resumption handle is kept outside the individual
    connection so a new Gemini connection can resume
    the previous Live session.
    """

    def __init__(
        self,
        resumption_handle: Optional[str] = None,
    ):
        self.resumption_handle = resumption_handle
        self.websocket = None

    # -----------------------------------------------------
    # CONNECT
    # -----------------------------------------------------

    async def connect(self):

        websocket = await websockets.connect(
            f"{GEMINI_WS_URL}?key={API_KEY}",
            open_timeout=10,
            close_timeout=5,
        )

        self.websocket = websocket

        # -------------------------------------------------
        # SESSION RESUMPTION
        # -------------------------------------------------

        if self.resumption_handle:

            session_resumption = {
                "handle": self.resumption_handle
            }

            print(
                "[GEMINI] Connecting with session "
                "resumption handle."
            )

        else:

            session_resumption = {}

            print(
                "[GEMINI] Starting new Live session."
            )

        # -------------------------------------------------
        # SETUP
        # -------------------------------------------------

        setup_message = {
            "setup": {
                "model": f"models/{MODEL}",

                "generationConfig": {
                    "responseModalities": [
                        "TEXT"
                    ],
                },

                "inputAudioTranscription": {
                    "languageCodes": [],
                    "mode": "SMART",
                    "customVocabulary": [
                        "MUAWIN",
                        "Moellim",
                        "Riphah",
                        "Parallel Computing",
                        "Distributed Systems",
                        "Software Engineering",
                        "Playwright",
                    ],
                },
                "realtimeInputConfig": {
                    "automaticActivityDetection": {
                        "silenceDurationMs": 650,
                    }
                },

                "sessionResumption": (
                    session_resumption
                ),
            }
        }

        await websocket.send(
            json.dumps(setup_message)
        )

        # -------------------------------------------------
        # WAIT FOR SETUP COMPLETE
        # -------------------------------------------------

        response = await asyncio.wait_for(
            websocket.recv(),
            timeout=10,
        )

        if isinstance(response, bytes):

            response = response.decode("utf-8")

        setup_response = json.loads(response)

        if "setupComplete" not in setup_response:

            await websocket.close()

            self.websocket = None

            raise RuntimeError(
                f"Gemini setup failed: "
                f"{setup_response}"
            )

        print(
            "[GEMINI] Live session setup complete."
        )

        return websocket

    # -----------------------------------------------------
    # SEND AUDIO
    # -----------------------------------------------------

    async def send_audio(
        self,
        base64_audio: str,
    ):

        if not self.websocket:
            raise RuntimeError(
                "Gemini WebSocket is not connected."
            )

        message = {
            "realtimeInput": {
                "audio": {
                    "data": base64_audio,
                    "mimeType": "audio/pcm;rate=16000",
                }
            }
        }

        await self.websocket.send(
            json.dumps(message)
        )

    # -----------------------------------------------------
    # END AUDIO
    # -----------------------------------------------------

    async def send_audio_end(self):

        if not self.websocket:
            return

        await self.websocket.send(
            json.dumps(
                {
                    "realtimeInput": {
                        "audioStreamEnd": True
                    }
                }
            )
        )

    # -----------------------------------------------------
    # RECEIVE
    # -----------------------------------------------------

    async def receive(self):

        if not self.websocket:
            raise RuntimeError(
                "Gemini WebSocket is not connected."
            )

        response = await self.websocket.recv()

        if isinstance(response, bytes):

            response = response.decode("utf-8")

        return json.loads(response)

    # -----------------------------------------------------
    # CLOSE
    # -----------------------------------------------------

    async def close(self):

        if self.websocket:

            with suppress(Exception):

                await self.websocket.close()

            self.websocket = None


# =========================================================
# CLIENT AUDIO READER
# =========================================================

async def receive_client_audio(
    client_websocket: WebSocket,
    audio_queue: asyncio.Queue,
    stop_event: asyncio.Event,
    resume_state=None,
):
    """
    Receives audio messages from the browser.

    Browser sends JSON messages:

    {
        "type": "audio",
        "data": "<base64 PCM>"
    }

    or:

    {
        "type": "stop"
    }
    """

    try:

        while not stop_event.is_set():

            message = await client_websocket.receive_text()

            payload = json.loads(message)

            message_type = payload.get("type")

            # -------------------------------------------------
            # AUDIO
            # -------------------------------------------------

            if message_type == "audio":

                audio_data = payload.get("data")

                if resume_state is None:
                    if audio_data:
                        await audio_queue.put(audio_data)
                    continue

                if not isinstance(audio_data, str) or not 0 < len(audio_data) <= 32768:
                    await client_websocket.send_json({"type": "error", "message": "Invalid audio frame."})
                    continue
                capture = payload.get("capture")
                sequence = payload.get("sequence")
                if not isinstance(capture, str) or len(capture) != 36 or type(sequence) is not int or sequence < 1:
                    continue
                if capture != resume_state.get("capture"):
                    resume_state.update(capture=capture, accepted=0)
                if sequence > resume_state["accepted"]:
                    await audio_queue.put(audio_data)
                    resume_state["accepted"] = sequence
                await client_websocket.send_json({"type": "audio_ack", "sequence": sequence})

            # -------------------------------------------------
            # STOP
            # -------------------------------------------------

            elif message_type == "stop":

                stop_event.set()

                return

            elif message_type == "finish":
                await audio_queue.put(None)
                await stop_event.wait()
                return

            # -------------------------------------------------
            # PING
            # -------------------------------------------------

            elif message_type == "ping":

                await client_websocket.send_json(
                    {
                        "type": "pong"
                    }
                )

    except WebSocketDisconnect:

        stop_event.set()

    except Exception as error:

        print(
            "[CLIENT] Audio reader error:",
            error,
        )

        stop_event.set()


# =========================================================
# SEND AUDIO TO GEMINI
# =========================================================

async def send_audio_to_gemini(
    gemini_session: GeminiLiveSession,
    audio_queue: asyncio.Queue,
    stop_event: asyncio.Event,
    pending_audio: list,
    finishing: asyncio.Event,
):
    """
    Sends queued browser audio to Gemini.

    The queue allows audio to wait while Gemini's
    connection is being rotated.
    """

    while not stop_event.is_set():

        if not pending_audio:
            pending_audio.append(await audio_queue.get())
        if pending_audio[0] is None:
            await gemini_session.send_audio_end()
            pending_audio.clear()
            finishing.set()
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=4)
            except asyncio.TimeoutError:
                stop_event.set()
            return
        await gemini_session.send_audio(pending_audio[0])
        pending_audio.clear()


# =========================================================
# RECEIVE TRANSCRIPTION FROM GEMINI
# =========================================================

async def receive_from_gemini(
    client_websocket: WebSocket,
    gemini_session: GeminiLiveSession,
    stop_event: asyncio.Event,
    on_final=None,
    finishing=None,
):
    """
    Receives Gemini Live messages and forwards
    transcription events to the browser.
    """

    while not stop_event.is_set():

        payload = await gemini_session.receive()

        # -------------------------------------------------
        # SESSION RESUMPTION UPDATE
        # -------------------------------------------------

        resumption_update = payload.get(
            "sessionResumptionUpdate"
        )

        if resumption_update:

            resumable = resumption_update.get(
                "resumable",
                False,
            )

            new_handle = resumption_update.get(
                "newHandle"
            )

            if resumable and new_handle:
                gemini_session.resumption_handle = new_handle

        # -------------------------------------------------
        # GO AWAY
        # -------------------------------------------------

        go_away = payload.get(
            "goAway"
        )

        if go_away:

            print(
                "[GEMINI] GoAway received:",
                go_away,
            )

            return "goaway"

        # -------------------------------------------------
        # SERVER CONTENT
        # -------------------------------------------------

        server_content = payload.get(
            "serverContent"
        )

        if not server_content:
            continue

        # -------------------------------------------------
        # INTERIM TRANSCRIPTION
        # -------------------------------------------------

        interim_transcription = (
            server_content.get(
                "interimInputTranscription"
            )
        )

        if interim_transcription:

            text = interim_transcription.get(
                "text",
                ""
            )

            if text:

                await client_websocket.send_json(
                    {
                        "type": "transcript",
                        "text": text,
                        "final": False,
                    }
                )

        # -------------------------------------------------
        # FINAL TRANSCRIPTION
        # -------------------------------------------------

        input_transcription = (
            server_content.get(
                "inputTranscription"
            )
        )

        if input_transcription:

            text = input_transcription.get(
                "text",
                ""
            )

            if text:
                event = {"type": "transcript", "text": text, "final": True}
                if on_final:
                    event.update(await on_final(text))

                await client_websocket.send_json(event)

        # -------------------------------------------------
        # TURN COMPLETE
        # -------------------------------------------------

        if server_content.get(
            "turnComplete"
        ):

            await client_websocket.send_json(
                {
                    "type": "turn_complete"
                }
            )
            if finishing and finishing.is_set():
                stop_event.set()
                return "stopped"

    return "closed"


# =========================================================
# SESSION ROTATION TIMER
# =========================================================

async def wait_for_session_rotation(
    stop_event: asyncio.Event,
):

    try:

        await asyncio.wait_for(
            stop_event.wait(),
            timeout=SESSION_ROTATION_SECONDS,
        )

        return "stopped"

    except asyncio.TimeoutError:

        return "rotate"


# =========================================================
# MAIN TRANSCRIPTION HANDLER
# =========================================================

async def handle_transcription(
    client_websocket: WebSocket,
    *,
    on_final=None,
    stop_event=None,
    resume_state=None,
):
    """
    Maintains one browser transcription connection while
    automatically renewing the internal Gemini Live session.
    """

    # -----------------------------------------------------
    # SHARED STATE
    # -----------------------------------------------------

    if not API_KEY:
        await client_websocket.send_json({"type": "error", "message": "Gemini Live is not configured."})
        await client_websocket.close(code=1011)
        return

    state = resume_state if resume_state is not None else {}
    audio_queue = state.setdefault("queue", asyncio.Queue(maxsize=512))
    pending_audio = state.setdefault("pending", [])
    pending_finals = state.setdefault("finals", [])
    stop_event = stop_event or asyncio.Event()
    resumption_handle = state.get("handle")
    retry_delay = 1

    client_reader = None

    async def save_final(text=None):
        if text is not None:
            pending_finals.append((uuid4().hex, text))
        metadata = {}
        while pending_finals:
            event_id, original = pending_finals[0]
            metadata = await on_final(original, event_id)
            pending_finals.pop(0)
        return metadata

    try:

        # -------------------------------------------------
        # START CLIENT AUDIO READER
        # -------------------------------------------------

        client_reader = asyncio.create_task(
            receive_client_audio(
                client_websocket,
                audio_queue,
                stop_event,
                resume_state,
            )
        )

        # -------------------------------------------------
        # GEMINI CONNECTION LOOP
        # -------------------------------------------------

        while not stop_event.is_set():

            gemini_session = GeminiLiveSession(
                resumption_handle
            )

            sender = None
            receiver = None
            rotation_timer = None
            finishing = asyncio.Event()

            try:

                # -----------------------------------------
                # CONNECT / RESUME
                # -----------------------------------------

                if pending_finals:
                    await save_final()
                await gemini_session.connect()
                retry_delay = 1

                await client_websocket.send_json(
                    {
                        "type": "status",
                        "status": "connected",
                        "model": MODEL,
                        "resumed": (
                            resumption_handle
                            is not None
                        ),
                    }
                )

                # -----------------------------------------
                # START SEND/RECEIVE TASKS
                # -----------------------------------------

                sender = asyncio.create_task(
                    send_audio_to_gemini(
                        gemini_session,
                        audio_queue,
                        stop_event,
                        pending_audio,
                        finishing,
                    )
                )

                receiver = asyncio.create_task(
                    receive_from_gemini(
                        client_websocket,
                        gemini_session,
                        stop_event,
                        save_final if on_final else None,
                        finishing,
                    )
                )

                rotation_timer = asyncio.create_task(
                    wait_for_session_rotation(
                        stop_event
                    )
                )

                done, pending = await asyncio.wait(
                    {
                        sender,
                        receiver,
                        rotation_timer,
                        client_reader,
                    },
                    return_when=asyncio.FIRST_COMPLETED,
                )

                # -----------------------------------------
                # KEEP LATEST RESUMPTION HANDLE
                # -----------------------------------------

                if gemini_session.resumption_handle:

                    resumption_handle = (
                        gemini_session.resumption_handle
                    )
                    state["handle"] = resumption_handle

                print(
                    "[GEMINI] Current resumption handle "
                    "available:",
                    bool(resumption_handle),
                )

                # -----------------------------------------
                # STOP REQUEST
                # -----------------------------------------

                if stop_event.is_set():

                    break

                if sender in done:
                    sender.result()
                receiver_result = None
                rotation_result = None

                if receiver in done:

                    receiver_result = receiver.result()

                if rotation_timer in done:

                    with suppress(
                        asyncio.CancelledError,
                        Exception,
                    ):

                        rotation_result = (
                            rotation_timer.result()
                        )

                # -----------------------------------------
                # CANCEL CURRENT GEMINI TASKS
                # -----------------------------------------

                for task in pending:

                    if task == client_reader:
                        continue

                    task.cancel()

                    with suppress(
                        asyncio.CancelledError
                    ):

                        await task

                # -----------------------------------------
                # PROACTIVE ROTATION
                # -----------------------------------------

                if rotation_result == "rotate":

                    print(
                        "[GEMINI] Proactive session "
                        "rotation triggered."
                    )

                    await gemini_session.close()

                    await asyncio.sleep(0.2)

                    continue

                # -----------------------------------------
                # GEMINI CONNECTION ENDED
                # -----------------------------------------

                if receiver_result in (
                    "goaway",
                    "closed",
                    None,
                ):

                    print(
                        "[GEMINI] Reconnecting after "
                        "connection termination."
                    )

                    await gemini_session.close()

                    await asyncio.sleep(0.2)

                    continue

            except Exception as error:

                print(
                    "[GEMINI] Connection error:", type(error).__name__,
                )

                if sender is None and resumption_handle:
                    resumption_handle = None
                    state.pop("handle", None)

                if stop_event.is_set():
                    break

                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=retry_delay)
                except asyncio.TimeoutError:
                    retry_delay = min(retry_delay * 2, 15)

            finally:

                for task in (
                    sender,
                    receiver,
                    rotation_timer,
                ):

                    if task:

                        task.cancel()

                        with suppress(
                            asyncio.CancelledError, Exception
                        ):

                            await task

                await gemini_session.close()

    except WebSocketDisconnect:

        stop_event.set()

    except Exception as error:

        print(
            "[TRANSCRIPTION ERROR]",
            error,
        )

        with suppress(Exception):

            await client_websocket.send_json(
                {
                    "type": "error",
                    "message": str(error),
                }
            )

    finally:

        stop_event.set()
        if pending_finals:
            with suppress(Exception):
                await save_final()

        # Stop the audio reader.
        if client_reader:

            client_reader.cancel()

            with suppress(
                asyncio.CancelledError
            ):

                await client_reader

        with suppress(Exception):

            await client_websocket.close(
                code=1000,
                reason="Transcription session ended",
            )


# =========================================================
# STANDALONE TRANSCRIPTION WEBSOCKET
# =========================================================

@router.websocket("/ws/transcribe")
async def transcribe(
    websocket: WebSocket,
):

    await websocket.accept()

    print(
        "[STT] Browser connected."
    )

    try:

        await handle_transcription(
            websocket
        )

    except WebSocketDisconnect:

        print(
            "[STT] Browser disconnected."
        )

    finally:

        print(
            "[STT] Transcription session ended."
        )
