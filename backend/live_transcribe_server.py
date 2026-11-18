import os
import json
import asyncio
import base64
from contextlib import suppress
from pathlib import Path
from typing import Optional

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

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing from backend/.env"
    )

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
        "status": "ok",
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

                if audio_data:
                    await audio_queue.put(
                        audio_data
                    )

            # -------------------------------------------------
            # STOP
            # -------------------------------------------------

            elif message_type == "stop":

                stop_event.set()

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
):
    """
    Sends queued browser audio to Gemini.

    The queue allows audio to wait while Gemini's
    connection is being rotated.
    """

    while not stop_event.is_set():

        audio_data = await audio_queue.get()

        if audio_data is None:
            return

        try:

            await gemini_session.send_audio(
                audio_data
            )

        except Exception:

            # Put audio back into the queue so the
            # next Gemini connection can retry it.
            await audio_queue.put(
                audio_data
            )

            raise


# =========================================================
# RECEIVE TRANSCRIPTION FROM GEMINI
# =========================================================

async def receive_from_gemini(
    client_websocket: WebSocket,
    gemini_session: GeminiLiveSession,
    stop_event: asyncio.Event,
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

            print(
                "[GEMINI] Session resumption update:",
                resumption_update,
            )

            resumable = resumption_update.get(
                "resumable",
                False,
            )

            new_handle = resumption_update.get(
                "newHandle"
            )

            if resumable and new_handle:

                gemini_session.resumption_handle = (
                    new_handle
                )

                print(
                    "[GEMINI] Updated session "
                    "resumption handle."
                )

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

                await client_websocket.send_json(
                    {
                        "type": "transcript",
                        "text": text,
                        "final": True,
                    }
                )

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
):
    """
    Maintains one browser transcription connection while
    automatically renewing the internal Gemini Live session.
    """

    # -----------------------------------------------------
    # SHARED STATE
    # -----------------------------------------------------

    audio_queue = asyncio.Queue()

    stop_event = asyncio.Event()

    resumption_handle = None

    client_reader = None

    try:

        # -------------------------------------------------
        # START CLIENT AUDIO READER
        # -------------------------------------------------

        client_reader = asyncio.create_task(
            receive_client_audio(
                client_websocket,
                audio_queue,
                stop_event,
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

            try:

                # -----------------------------------------
                # CONNECT / RESUME
                # -----------------------------------------

                await gemini_session.connect()

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
                    )
                )

                receiver = asyncio.create_task(
                    receive_from_gemini(
                        client_websocket,
                        gemini_session,
                        stop_event,
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

                receiver_result = None
                rotation_result = None

                if receiver in done:

                    with suppress(
                        asyncio.CancelledError,
                        Exception,
                    ):

                        receiver_result = (
                            receiver.result()
                        )

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
                    "[GEMINI] Connection error:",
                    error,
                )

                await gemini_session.close()

                if stop_event.is_set():
                    break

                await asyncio.sleep(1)

            finally:

                for task in (
                    sender,
                    receiver,
                    rotation_timer,
                ):

                    if task:

                        task.cancel()

                        with suppress(
                            asyncio.CancelledError
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