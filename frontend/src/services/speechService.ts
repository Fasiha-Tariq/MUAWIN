/**
 * MUAWIN Speech-to-Text Service
 * Uses browser speech recognition when supported.
 *
 * Note: Web Speech API availability and recognition quality
 * vary by browser. Chrome generally provides the best support.
 */

export interface VoiceCommandSample {
  id: string;
  transcript: string;
  label: string;
  description: string;
  isMultiAction?: boolean;
}

export const SAMPLE_VOICE_COMMANDS: VoiceCommandSample[] = [
  {
    id: 'cmd-multi-1',
    transcript: 'Upload Lecture 2 and create an assignment.',
    label: 'Multi-Action: Upload & Assignment',
    description:
      'Uploads Lecture 2 materials and prepares an assignment workflow for teacher approval.',
    isMultiAction: true
  },
  {
    id: 'cmd-reminder',
    transcript: 'Create a reminder for the quiz on Friday.',
    label: 'Single Action: Quiz Reminder',
    description: 'Prepares a reminder workflow for approval.'
  },
  {
    id: 'cmd-completed',
    transcript: "Mark today's lecture as completed.",
    label: 'Single Action: Mark Lecture Delivered',
    description: 'Prepares a lecture completion workflow for approval.'
  },
  {
    id: 'cmd-upload-pdc',
    transcript:
      'Upload this lecture material to Parallel and Distributed Computing.',
    label: 'Course-Specific Upload',
    description: 'Targets the specified course.'
  }
];

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'result'
  | 'error';

export interface SpeechRecognitionSimulationResult {
  transcript: string;
  confidence: number;
  durationSeconds: number;
}

interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}

interface RecognitionResultList {
  length: number;
  [index: number]: RecognitionResult;
}

interface RecognitionEvent {
  resultIndex: number;
  results: RecognitionResultList;
}

interface RecognitionErrorEvent {
  error: string;
  message?: string;
}

interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): RecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export const speechService = {
  getSampleCommands(): VoiceCommandSample[] {
    return SAMPLE_VOICE_COMMANDS;
  },

  /**
   * Listen to the user's real microphone and return the transcription.
   * Call this from a user-initiated microphone button click.
   */
  async simulateSpeechToText(
    _customText?: string,
    onStateChange?: (state: VoiceState) => void
  ): Promise<SpeechRecognitionSimulationResult> {
    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      onStateChange?.('error');

      throw new Error(
        'Speech recognition is not supported in this browser. Please use a supported version of Chrome.'
      );
    }

    const recognition = new Recognition();

    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    return new Promise((resolve, reject) => {
      let finalTranscript = '';
      let confidence = 0;
      const startedAt = Date.now();
      let settled = false;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        onStateChange?.('error');
        reject(new Error(message));
      };

      recognition.onstart = () => {
        onStateChange?.('listening');
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';

        for (
          let i = event.resultIndex;
          i < event.results.length;
          i++
        ) {
          const result = event.results[i];
          const alternative = result[0];

          if (result.isFinal) {
            finalTranscript += alternative.transcript + ' ';
            confidence = alternative.confidence || confidence;
          } else {
            interimTranscript += alternative.transcript;
          }
        }

        // Interim text can be displayed by the UI if desired.
        void interimTranscript;
      };

      recognition.onerror = (event) => {
        const messages: Record<string, string> = {
          'not-allowed':
            'Microphone permission was denied. Allow microphone access in your browser settings.',
          'no-speech':
            'No speech was detected. Please try again.',
          'audio-capture':
            'No microphone was found. Check your microphone connection.',
          network:
            'Speech recognition encountered a network error. Please try again.'
        };

        fail(
          messages[event.error] ||
            event.message ||
            `Speech recognition failed: ${event.error}`
        );
      };

      recognition.onend = () => {
        if (settled) return;

        const transcript = finalTranscript.trim();

        if (!transcript) {
          fail('No speech was transcribed. Please try again.');
          return;
        }

        settled = true;
        onStateChange?.('processing');

        const durationSeconds = Math.max(
          0,
          (Date.now() - startedAt) / 1000
        );

        onStateChange?.('result');

        resolve({
          transcript,
          confidence,
          durationSeconds
        });
      };

      try {
        // This must be initiated by the user's microphone click.
        recognition.start();
      } catch (error) {
        fail(
          error instanceof Error
            ? error.message
            : 'Could not start microphone recognition.'
        );
      }
    });
  }
};
