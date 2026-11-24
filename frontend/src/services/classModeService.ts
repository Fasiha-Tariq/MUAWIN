import { api, getAuthToken, getWebSocketUrl } from './api';
import { encodePcm } from './pcmAudio';

export interface ClassSession {
  id: string;
  course_id: string;
  course: string;
  started_at: string;
  ended_at: string | null;
  timezone: string;
}

export interface TranscriptSegment {
  sequence: number;
  text: string;
  timestamp: string;
}

export type ClassMicrophoneStatus =
  | { phase: 'idle' | 'permission' | 'connecting' | 'listening' | 'reconnecting' | 'stopping' }
  | { phase: 'error'; message: string }
  | { phase: 'connecting' | 'listening' | 'reconnecting'; warning: string };

export interface ClassMicrophoneInput {
  device: string;
  level: number;
  state: 'starting' | 'no_frames' | 'quiet' | 'sending' | 'received';
}

export interface ClassSuggestion {
  id: string;
  decision: string;
  payload: {
    type: string;
    intent: string;
    operation?: 'upload_lecture' | 'create_assignment';
    name?: string;
    deadline?: string;
    availability?: string;
    assessment_date?: string;
    availability_date_iso?: string;
    deadline_date_iso?: string;
    assessment_date_iso?: string;
    coverage?: string;
    instructions?: string;
    evidence?: string;
    requires_clarification: boolean;
  };
  review: { title: string; week: number; material?: string; marks?: number;
    deadline?: string; publish_from?: string; instructions?: string } | null;
  workflows: Array<{ id: string; status: string; result: unknown; error: string | null }>;
}

export interface ClassStatus {
  session: ClassSession | null;
  active: ClassSession | null;
  upcoming: string | null;
  history: ClassSession[];
}

export interface ClassDetails {
  session: ClassSession;
  segments: TranscriptSegment[];
  chunks: Array<{ id: string; status: string; error: string | null;
    result: Record<'topics' | 'key_points' | 'important_concepts', string[]> | null }>;
  suggestions: ClassSuggestion[];
}

const base = '/class-mode';
const sessionPath = (id: string) => base + '/sessions/' + encodeURIComponent(id);

export const classModeService = {
  status: (course_id: string) => api.get<ClassStatus>(base + '/status', { params: { course_id } }),
  start: (course_id: string) => api.post<ClassSession>(base + '/start', undefined, { params: { course_id } }),
  stop: (id: string) => api.post<ClassSession>(sessionPath(id) + '/stop'),
  details: (id: string, after: number) => api.get<ClassDetails>(sessionPath(id), { params: { after } }),
  retry: (id: string) => api.post(sessionPath(id) + '/retry-analysis'),
  reject: (id: string, suggestion: string) => api.post(sessionPath(id) + '/suggestions/' + suggestion + '/reject'),
  prepare: (id: string, suggestion: string, review: unknown) =>
    api.post<{ id: string; status: string; error?: string }>(
      sessionPath(id) + '/suggestions/' + suggestion + '/prepare', review,
    ),
};

export async function openClassMicrophone(
  sessionId: string,
  signal: AbortSignal,
  onInterim: (text: string) => void,
  onFinal: (segment: TranscriptSegment) => void,
  onStatus: (status: ClassMicrophoneStatus) => void,
  onInput: (input: ClassMicrophoneInput) => void,
) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access requires HTTPS or localhost.');
  }
  const token = getAuthToken();
  if (!token) throw new Error('Sign in to capture class audio.');
  const endpoint = getWebSocketUrl(sessionPath(sessionId).slice(1) + '/audio');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') throw new Error('Allow microphone access in your browser, then try again.');
      if (error.name === 'NotFoundError') throw new Error('Connect a microphone, then try again.');
      if (error.name === 'NotReadableError') throw new Error('The microphone is unavailable. Check your device settings, then try again.');
    }
    throw error;
  }
  let audio: AudioContext | undefined;
  let socket: WebSocket | undefined;
  let reconnect: number | undefined;
  let handshake: number | undefined;
  let inputTimer: number | undefined;
  let authorized = false;
  let delay = 500;
  let conflictRetries = 0;
  let closed = false;
  let providerReady = false;
  let bufferWarning = false;
  const capture = crypto.randomUUID();
  let sequence = 0;
  let sentThrough = 0;
  const pending: Array<{ sequence: number; data: string }> = [];
  let finish: (() => void) | undefined;
  let draining = false;
  let lastFrameAt = 0;
  let lastSignalAt = 0;
  let lastAckAt = 0;
  let peakLevel = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', close);
    window.clearTimeout(reconnect);
    window.clearTimeout(handshake);
    window.clearInterval(inputTimer);
    socket?.close();
    stream.getTracks().forEach(track => track.stop());
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined);
  };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) { close(); return; }
  onStatus({ phase: 'connecting' });

  try {
    audio = new AudioContext();
    const source = audio.createMediaStreamSource(stream);
    const processor = audio.createScriptProcessor(4096, 1, 1);
    const mute = audio.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audio.destination);
    await audio.resume();
    if (signal.aborted) return;

    const flush = () => {
      for (const frame of pending) {
        if (!authorized || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 256_000) break;
        if (frame.sequence <= sentThrough) continue;
        socket.send(frame.data);
        sentThrough = frame.sequence;
      }
    };

    const connect = () => {
      if (closed || signal.aborted) return;
      authorized = false;
      providerReady = false;
      sentThrough = 0;
      const current = new WebSocket(endpoint);
      socket = current;
      let serverError: string | undefined;
      handshake = window.setTimeout(() => {
        current.close();
      }, 8000);
      current.onopen = () => current.send(JSON.stringify({ token }));
      current.onmessage = ({ data }) => {
        if (closed || signal.aborted || current !== socket) return;
        const message = JSON.parse(data);
        if (message.type === 'authorized') {
          window.clearTimeout(handshake);
          authorized = true;
          conflictRetries = 0;
          flush();
        } else if (message.type === 'audio_ack') {
          lastAckAt = performance.now();
          while (pending.length && pending[0].sequence <= message.sequence) pending.shift();
          if (pending.length < 256) bufferWarning = false;
          flush();
        } else if (message.type === 'transcript') {
          if (message.final) {
            if (typeof message.sequence === 'number' && typeof message.timestamp === 'string') {
              onFinal({ sequence: message.sequence, timestamp: message.timestamp, text: message.text });
            }
            onInterim('');
          } else {
            onInterim(message.text);
          }
        } else if (message.type === 'status' && message.status === 'connected') {
          delay = 500;
          providerReady = true;
          if (!draining) onStatus({ phase: 'listening' });
        } else if (message.type === 'status' && message.status === 'reconnecting') {
          providerReady = false;
          if (!draining) onStatus({ phase: 'reconnecting' });
        } else if (message.type === 'error') {
          serverError = typeof message.message === 'string' ? message.message : undefined;
        }
      };
      current.onclose = ({ code }) => {
        if (current !== socket) return;
        window.clearTimeout(handshake);
        if (finish) { finish(); return; }
        if (closed || signal.aborted) return;
        if (code === 4409 && conflictRetries++ < 1) {
          onStatus({ phase: 'reconnecting' });
          reconnect = window.setTimeout(connect, 1000);
          return;
        }
        const terminalMessage = {
          4401: 'Your sign-in or access to this class expired. Sign in again to continue.',
          4403: 'This class session has ended.',
          4409: 'Transcription is already open for this class. Stop it in the other tab, then try again.',
          1011: serverError || 'The transcription service is unavailable. Try again.',
        }[code];
        if (terminalMessage) {
          close();
          onStatus({ phase: 'error', message: terminalMessage });
          return;
        }
        onStatus({ phase: 'reconnecting' });
        reconnect = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 8000);
      };
    };
    processor.onaudioprocess = event => {
      if (closed || signal.aborted || draining) return;
      const samples = event.inputBuffer.getChannelData(0);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      lastFrameAt = performance.now();
      if (rms >= 0.006) lastSignalAt = lastFrameAt;
      peakLevel = Math.max(peakLevel, Math.min(1, rms * 12));
      const data = encodePcm(samples, audio!.sampleRate);
      if (!data) return;
      if (pending.length === 512) {
        pending.shift();
        if (!bufferWarning) {
          bufferWarning = true;
          onStatus({
            phase: providerReady ? 'listening' : 'reconnecting',
            warning: 'The audio buffer filled up. Some audio may be missing from the transcript.',
          });
        }
      }
      sequence += 1;
      pending.push({ sequence, data: JSON.stringify({ type: 'audio', data, capture, sequence }) });
      flush();
    };
    const device = stream.getAudioTracks()[0]?.label || 'Default microphone';
    const startedAt = performance.now();
    onInput({ device, level: 0, state: 'starting' });
    inputTimer = window.setInterval(() => {
      if (draining) return;
      const now = performance.now();
      const state = now - startedAt < 3000 ? 'starting'
        : !lastFrameAt || now - lastFrameAt > 2500 ? 'no_frames'
        : !lastSignalAt || now - lastSignalAt > 3000 ? 'quiet'
        : !lastAckAt || now - lastAckAt > 3000 ? 'sending' : 'received';
      onInput({ device, level: peakLevel, state });
      peakLevel *= 0.35;
    }, 200);
    connect();

    return async () => {
      if (closed) return;
      draining = true;
      processor.onaudioprocess = null;
      if (authorized && socket?.readyState === WebSocket.OPEN) {
        const current = socket;
        await new Promise<void>(resolve => {
          const timeout = window.setTimeout(resolve, 6000);
          finish = () => { window.clearTimeout(timeout); resolve(); };
          for (const frame of pending) {
            if (frame.sequence > sentThrough) current.send(frame.data);
          }
          current.send(JSON.stringify({ type: 'finish' }));
        });
      }
      close();
    };
  } catch (error) {
    close();
    throw error;
  }
}
