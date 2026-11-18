import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  Sparkles,
  Send,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Clock,
  ShieldCheck,
  FileText,
  RotateCcw,
  Mic,
  Plus,
  Radio,
  Sliders,
  Volume2,
  Calendar,
  Info,
  Edit3,
} from 'lucide-react';

import { useApp } from '../context/AppContext';

import {
  assistantService,
  InterpretationResult,
} from '../services/assistantService';

import {
  speechService,
  VoiceState,
  SAMPLE_VOICE_COMMANDS,
  VoiceCommandSample,
} from '../services/speechService';

import { IntentCard } from '../components/assistant/IntentCard';

import { WorkflowItem } from '../types';
import { fileAssignmentService } from '../services/fileAssignmentService';

export const Assistant: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    courses,
    selectedCourse,
    selectCourse,
    addWorkflow,
    addToast,
    clarifyAssignmentWorkflow,
  } = useApp();

  // ============================================================
  // COURSE CONTEXT
  // ============================================================

  useEffect(() => {
    if (
      location.state &&
      (location.state as any).courseId
    ) {
      selectCourse(
        (location.state as any).courseId
      );
    }
    
  }, [
    location.state,
    selectCourse,
  ]);

  // ============================================================
  // COMMAND STATE
  // ============================================================

  const [prompt, setPrompt] =
    useState('');

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [pendingAssignmentClarification, setPendingAssignmentClarification] =
    useState<WorkflowItem | null>(null);

  const [assignmentClarificationAnswer, setAssignmentClarificationAnswer] =
    useState('');

  const [interpretations, setInterpretations] =
    useState<InterpretationResult[]>([]);

  const [activeInterpretationIndex, setActiveInterpretationIndex] =
    useState(0);

  const [isSubmittedToApproval, setIsSubmittedToApproval] =
    useState(false);

  const [isEditingPayload, setIsEditingPayload] =
    useState(false);

  const [editedPayloads, setEditedPayloads] =
    useState<Record<number, Record<string, any>>>({});

  const [showWorkflowPlan, setShowWorkflowPlan] =
    useState(false);

  const [pendingFileAssignment, setPendingFileAssignment] =
    useState<any | null>(null);

  const [showNoAssignmentFileModal, setShowNoAssignmentFileModal] =
    useState(false);

  const [fileAssignmentFileName, setFileAssignmentFileName] =
    useState('');

  const [fileAssignmentWeek, setFileAssignmentWeek] =
    useState('');

  const [fileAssignmentTitle, setFileAssignmentTitle] =
    useState('');

  const [fileAssignmentStartDate, setFileAssignmentStartDate] =
    useState('');

  const [fileAssignmentDueDate, setFileAssignmentDueDate] =
    useState('');

  const [fileAssignmentMarks, setFileAssignmentMarks] =
    useState('');

  // ============================================================
  // VOICE STATE
  // ============================================================

  const [voiceState, setVoiceState] =
    useState<VoiceState>('idle');

  const [voiceTranscript, setVoiceTranscript] =
    useState<string>('');

  const [showVoiceDrawer, setShowVoiceDrawer] =
    useState(false);

  const [showTemplateDropdown, setShowTemplateDropdown] =
    useState(false);

  const dropdownRef =
    useRef<HTMLDivElement>(null);

  const voiceDrawerRef =
    useRef<HTMLDivElement>(null);
    
  // ============================================================
  // LIVE TRANSCRIPTION REFERENCES
  // ============================================================

  const transcriptionSocketRef = useRef<WebSocket | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const speechBasePromptRef = useRef('');
  const speechFinalTextRef = useRef('');
  const speechInterimTextRef = useRef('');
  const stoppingTranscriptionRef = useRef(false);

  // ============================================================
  // SUBMISSION LOCK
  // ============================================================
  /*
   * React state is asynchronous.
   *
   * If a teacher clicks the submit button twice very quickly,
   * isSubmittedToApproval may still be false for both clicks.
   *
   * This ref provides an immediate synchronous lock so the
   * backend cannot receive duplicate preparation requests.
   */

  const submissionLockRef =
    useRef(false);

  // ============================================================
  // ACTIVE INTERPRETATION
  // ============================================================

  const activeInterpretation =
    interpretations.length > 0
      ? interpretations[
          Math.min(
            activeInterpretationIndex,
            interpretations.length - 1
          )
        ]
      : null;

  const activeEditedPayload =
    activeInterpretation
      ? (
          editedPayloads[
            activeInterpretationIndex
          ] ||
          activeInterpretation.suggestedPayload ||
          {}
        )
      : {};

  // ============================================================
  // MULTI-ACTION HELPERS
  // ============================================================

  const isMultiAction =
    interpretations.length > 1;

  const lectureInterpretationIndex =
    interpretations.findIndex(
      (item) =>
        item.workflowType === 'lecture' ||
        item.intent
          ?.toLowerCase()
          .includes('upload lecture')
    );

  const assignmentInterpretationIndex =
    interpretations.findIndex(
      (item) =>
        item.workflowType === 'assignment' ||
        item.intent
          ?.toLowerCase()
          .includes('assignment')
    );

  const hasLectureAssignmentDependency =
    isMultiAction &&
    lectureInterpretationIndex !== -1 &&
    assignmentInterpretationIndex !== -1;

  // ============================================================
  // CLOSE TEMPLATE DROPDOWN
  // ============================================================

  useEffect(() => {
    const handleClickOutside =
      (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(
            event.target as Node
          )
        ) {
          setShowTemplateDropdown(false);
        }
      };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () =>
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
  }, []);

  // ============================================================
  // QUICK PROMPTS
  // ============================================================

  const getSuggestions = () => {
    if (!selectedCourse) {
      return [];
    }

    return [
      "Create an assignment from this week's lecture",
      "Upload this week's lecture notes",
      "Upload this week's lecture notes and create an assignment from the lecture",
    ];
  };

  // ============================================================
  // INTERPRET COMMAND
  // ============================================================

  const handleInterpret = async (
    textToInterpret?: string
  ) => {
    const text =
      textToInterpret || prompt;

    if (!text.trim()) {
      return;
    }

    // A new command starts a completely new workflow cycle.
    submissionLockRef.current = false;

    setIsProcessing(true);
    setIsSubmittedToApproval(false);
    setIsEditingPayload(false);
    setShowWorkflowPlan(false);

    try {
      const results =
        await assistantService.interpretInstruction(
          text,
          selectedCourse
        );

      if (
        !results ||
        results.length === 0
      ) {
        throw new Error(
          'MUAWIN could not identify a valid workflow.'
        );
      }

      console.log(
        '[Assistant] Interpretation results:',
        results
      );

      setInterpretations(results);

      setActiveInterpretationIndex(0);

      const initialPayloads: Record<
        number,
        Record<string, any>
      > = {};

      results.forEach(
        (
          interpretation,
          index
        ) => {
          initialPayloads[index] = {
            ...(
              interpretation.suggestedPayload ||
              {}
            ),

            workflowType:
              interpretation.workflowType,

            instruction:
              interpretation.rawInstruction,
          };
        }
      );

      setEditedPayloads(
        initialPayloads
      );

      if (results.length > 1) {
        addToast(
          'info',
          'Multiple Actions Detected',
          `MUAWIN identified ${results.length} separate workflows from your instruction.`
        );
      } else {
        addToast(
          'success',
          'Instruction Understood',
          `MUAWIN identified: ${results[0].intent}.`
        );
      }
    } catch (err: any) {
      console.error(
        '[Assistant] Interpretation failed:',
        err
      );

      addToast(
        'error',
        'Interpretation Error',
        err?.message ||
          'Failed to parse natural language intent. Please rephrase.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================
  // VOICE COMMAND
  // ============================================================

  const handleVoiceCommand =
    async (
      sampleCmd?: VoiceCommandSample
    ) => {
      const textToSimulate =
        sampleCmd
          ? sampleCmd.transcript
          : 'Upload Lecture 2 and create an assignment.';

      setShowVoiceDrawer(true);
      setVoiceTranscript(
        textToSimulate
      );

      try {
        const simResult =
          await speechService.simulateSpeechToText(
            textToSimulate,
            (newState) =>
              setVoiceState(
                newState
              )
          );

        setPrompt(
          simResult.transcript
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              600
            )
        );

        setVoiceState('idle');
        setShowVoiceDrawer(false);

        await handleInterpret(
          simResult.transcript
        );

        addToast(
          'info',
          'Voice Command Received',
          `Transcribed: "${simResult.transcript}"`
        );
      } catch (error) {
        console.error(
          '[Assistant] Voice command failed:',
          error
        );

        setVoiceState('idle');

        addToast(
          'error',
          'Voice Capture Failed',
          'Could not capture speech. Please try again.'
        );
      }
    };

  // ============================================================
  // LIVE MICROPHONE TRANSCRIPTION - COMMAND MODE ONLY
  // ============================================================

  const updatePromptFromTranscript = (
    finalText: string,
    interimText: string
  ) => {
    const base = speechBasePromptRef.current.trim();
    const spoken = [finalText, interimText]
      .filter(Boolean)
      .join(' ')
      .trim();

    const combined = [base, spoken]
      .filter(Boolean)
      .join(' ')
      .trim();

    setPrompt(combined);
    setVoiceTranscript(spoken);
  };

  const releaseMicrophoneResources = async () => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.onaudioprocess = null;
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }

    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      microphoneStreamRef.current = null;
    }

    if (audioContextRef.current) {
      const context = audioContextRef.current;
      audioContextRef.current = null;

      if (context.state !== 'closed') {
        try {
          await context.close();
        } catch (error) {
          console.warn('[Assistant] AudioContext cleanup:', error);
        }
      }
    }
  };

  const stopLiveTranscription = async () => {
    stoppingTranscriptionRef.current = true;

    await releaseMicrophoneResources();

    const socket = transcriptionSocketRef.current;

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'stop' }));
      } catch (error) {
        console.warn('[Assistant] Could not send stop message:', error);
      }
    }

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      // Allow the server a short opportunity to send final text.
      window.setTimeout(() => {
        if (transcriptionSocketRef.current === socket) {
          socket.close();
          transcriptionSocketRef.current = null;
        }
      }, 1200);
    } else {
      transcriptionSocketRef.current = null;
    }

    const hasTranscript = Boolean(
      speechFinalTextRef.current.trim() ||
      speechInterimTextRef.current.trim()
    );

    setVoiceState(hasTranscript ? 'result' : 'idle');

    if (!hasTranscript) {
      setShowVoiceDrawer(false);
    }
  };

  const startLiveTranscription = async () => {
    if (
      transcriptionSocketRef.current &&
      (
        transcriptionSocketRef.current.readyState === WebSocket.CONNECTING ||
        transcriptionSocketRef.current.readyState === WebSocket.OPEN
      )
    ) {
      return;
    }

    speechBasePromptRef.current = prompt.trim();
    speechFinalTextRef.current = '';
    speechInterimTextRef.current = '';
    stoppingTranscriptionRef.current = false;

    setVoiceTranscript('');
    setVoiceState('processing');
    setShowVoiceDrawer(true);

    let socket: WebSocket | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Microphone access is unavailable. Open MUAWIN in a supported browser and use localhost or HTTPS.'
        );
      }

      // Connect to the FastAPI transcription route.
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = `${protocol}//127.0.0.1:8000/ws/transcribe`;

      socket = new WebSocket(socketUrl);
      transcriptionSocketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('The transcription server did not connect in time.'));
        }, 10000);

        socket!.onopen = () => {
          window.clearTimeout(timeout);
          resolve();
        };

        socket!.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error('Could not connect to the transcription server.'));
        };

        socket!.onclose = () => {
          window.clearTimeout(timeout);

          if (!stoppingTranscriptionRef.current) {
            reject(new Error('The transcription connection closed unexpectedly.'));
          }
        };
      });

      // Ask permission only after the socket is connected.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (stoppingTranscriptionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      microphoneStreamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('This browser does not support Web Audio.');
      }

      const audioContext: AudioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      audioSourceRef.current = source;

      // ScriptProcessor is used here for compatibility with the existing app.
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const activeSocket = transcriptionSocketRef.current;

        if (
          !activeSocket ||
          activeSocket.readyState !== WebSocket.OPEN ||
          stoppingTranscriptionRef.current
        ) {
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        const inputRate = audioContext.sampleRate;
        const targetRate = 16000;
        const ratio = inputRate / targetRate;
        const outputLength = Math.floor(input.length / ratio);

        if (outputLength <= 0) return;

        // Downsample browser audio to the 16 kHz PCM format expected by the backend.
        const pcmBuffer = new ArrayBuffer(outputLength * 2);
        const view = new DataView(pcmBuffer);

        for (let i = 0; i < outputLength; i++) {
          const start = Math.floor(i * ratio);
          const end = Math.min(
            input.length,
            Math.floor((i + 1) * ratio)
          );

          let total = 0;
          let count = 0;

          for (let j = start; j < end; j++) {
            total += input[j];
            count++;
          }

          const sample = count ? total / count : input[start] || 0;
          const clamped = Math.max(-1, Math.min(1, sample));
          const int16 = clamped < 0
            ? clamped * 32768
            : clamped * 32767;

          view.setInt16(i * 2, int16, true);
        }

        // Convert PCM bytes to base64 for the existing WebSocket protocol.
        const bytes = new Uint8Array(pcmBuffer);
        let binary = '';

        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }

        activeSocket.send(JSON.stringify({
          type: 'audio',
          data: btoa(binary),
        }));
      };

      source.connect(processor);

      // Connect to the destination to keep processing active, but mute output.
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      setVoiceState('listening');
      addToast(
        'info',
        'Microphone Active',
        'Speak your instruction. Your words will appear in the command input.'
      );

      socket.onmessage = (event: MessageEvent) => {
        let message: any;

        try {
          message = JSON.parse(event.data);
        } catch {
          console.warn('[Assistant] Invalid transcription message:', event.data);
          return;
        }

        if (message.type === 'status') {
          console.log('[Assistant] Transcription status:', message.status);
          return;
        }

        if (message.type === 'pong') return;

        if (message.type === 'error') {
          console.error('[Assistant] Transcription server error:', message);
          addToast(
            'error',
            'Transcription Error',
            message.message || message.error || 'The transcription server reported an error.'
          );
          return;
        }

        if (message.type === 'transcript') {
          const text = String(
            message.text ??
            message.transcript ??
            ''
          ).trim();
        console.log('[MUAWIN STT] Incoming transcript:', {
          text: message.text ?? message.transcript ?? '',
          final: message.final ?? message.is_final ?? message.isFinal,
          type: message.type,
        });
          if (!text) return;

          const isFinal = Boolean(
            message.final ??
            message.is_final ??
            message.isFinal
          );

          if (isFinal) {
            speechFinalTextRef.current = [
              speechFinalTextRef.current,
              text,
            ].filter(Boolean).join(' ').trim();

            speechInterimTextRef.current = '';
          } else {
            speechInterimTextRef.current = text;
          }

          updatePromptFromTranscript(
            speechFinalTextRef.current,
            ''
          );

          setVoiceState('listening');
          return;
        }

        if (message.type === 'turn_complete') {
          speechInterimTextRef.current = '';

          updatePromptFromTranscript(
            speechFinalTextRef.current,
            ''
          );

          if (stoppingTranscriptionRef.current) {
            setVoiceState(
              speechFinalTextRef.current.trim() ? 'result' : 'idle'
            );
          }
        }
      };

      socket.onclose = () => {
        if (transcriptionSocketRef.current === socket) {
          transcriptionSocketRef.current = null;
        }

        if (!stoppingTranscriptionRef.current) {
          void releaseMicrophoneResources();
          setVoiceState('idle');
        }
      };
    } catch (error: any) {
      console.error('[Assistant] Live transcription failed:', error);

      await releaseMicrophoneResources();

      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }

      transcriptionSocketRef.current = null;
      stoppingTranscriptionRef.current = false;
      setVoiceState('idle');

      addToast(
        'error',
        'Microphone / Transcription Failed',
        error?.message ||
          'Could not start live transcription. Check microphone permission and the backend server.'
      );
    }
  };

  const handleToggleLiveTranscription = () => {
    if (voiceState === 'listening' || voiceState === 'processing') {
      void stopLiveTranscription();
    } else {
      void startLiveTranscription();
    }
  };

  // Clean up microphone resources if this page unmounts.
  useEffect(() => {
    return () => {
      stoppingTranscriptionRef.current = true;

      const socket = transcriptionSocketRef.current;
      transcriptionSocketRef.current = null;

      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'stop' }));
        } catch {
          // The page is unmounting; cleanup continues below.
        }
      }

      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }

      void releaseMicrophoneResources();
    };
  }, []);
  // ============================================================
  // UPDATE ACTIVE PAYLOAD
  // ============================================================

  const updateActivePayload = (
    updates: Record<string, any>
  ) => {
    if (!activeInterpretation) {
      return;
    }

    setEditedPayloads(
      (previous) => ({
        ...previous,

        [activeInterpretationIndex]: {
          ...(
            previous[
              activeInterpretationIndex
            ] ||
            activeInterpretation.suggestedPayload ||
            {}
          ),

          ...updates,

          workflowType:
            activeInterpretation.workflowType,

          instruction:
            activeInterpretation.rawInstruction,
        },
      })
    );
  };
  
  // ============================================================
  // CREATE LOCAL WORKFLOW OBJECT
  // ============================================================

  const buildWorkflowFromInterpretation =
    (
      interpretation: InterpretationResult,
      index: number
    ): WorkflowItem => {
      const workflowType =
        interpretation.workflowType ===
        'assignment'
          ? 'assignment'
          : 'lecture';

      const editedPayload =
        editedPayloads[index] ||
        interpretation.suggestedPayload ||
        {};

      const payload = {
        ...editedPayload,

        workflowType,

        instruction:
          interpretation.rawInstruction,

        targetSection:
          selectedCourse?.section,

        courseId:
          interpretation.courseId ||
          selectedCourse?.id ||
          '',

        courseCode:
          interpretation.courseCode ||
          selectedCourse?.code ||
          '',

        courseName:
          interpretation.courseName ||
          selectedCourse?.title ||
          '',
      };

      return {
        id:
          `${workflowType === 'assignment' ? 'awf' : 'wf'}-${Date.now()}-${index}`,

        title:
          interpretation.suggestedTitle,

        actionType:
          interpretation.intent,

        workflowType,

        courseId:
          interpretation.courseId ||
          selectedCourse?.id ||
          '',

        courseCode:
          interpretation.courseCode ||
          selectedCourse?.code ||
          '',

        courseName:
          interpretation.courseName ||
          selectedCourse?.title ||
          '',

        source:
          `Assistant Prompt: "${interpretation.rawInstruction.substring(
            0,
            80
          )}${interpretation.rawInstruction.length > 80 ? '...' : ''}"`,

        requestedBy:
          'Teacher Instruction',

        createdAt:
          new Date().toLocaleTimeString(
            [],
            {
              hour: '2-digit',
              minute: '2-digit',
            }
          ),

        status:
          'waiting_approval',

        currentStepIndex:
          Math.max(
            0,
            interpretation.suggestedSteps.findIndex(
              (step) =>
                step.status ===
                'in_progress'
            )
          ),

        steps:
          interpretation.suggestedSteps,

        detectedIntent: {
          intent:
            interpretation.intent,

          course:
            `${interpretation.courseCode} (${selectedCourse?.section || ''})`,

          source:
            interpretation.source ||
            'AI Assistant Intent Interpretation',

          action:
            interpretation.action,

          confidence:
            interpretation.confidence,
        },

        instructionText:
          interpretation.rawInstruction,

        payload,
      };
    };


  // ============================================================
  // SEND WORKFLOW(S) TO APPROVAL
  // ============================================================

  const handleSendToApprovals = async () => {
    if (submissionLockRef.current) {
      console.log(
        '[Assistant] Submission already in progress. Duplicate request ignored.'
      );
      return;
    }

    if (interpretations.length === 0 || !selectedCourse) {
      addToast(
        'error',
        'Course Required',
        'Please select a course and interpret an instruction before submitting.'
      );
      return;
    }

    if (isSubmittedToApproval) {
      return;
    }

    submissionLockRef.current = true;
    setIsProcessing(true);

    try {
      const createdWorkflows: WorkflowItem[] = [];

      // --------------------------------------------------------
      // SINGLE WORKFLOW
      // --------------------------------------------------------
      if (interpretations.length === 1) {
        if (
          interpretations[0].workflowType === 'file_assignment'
        ) {
          const prepared = await fileAssignmentService.prepare(
          selectedCourse.title || selectedCourse.code,
          interpretations[0].rawInstruction
          );

          if (prepared.status === 'no_match') {
            setPendingFileAssignment(prepared);
            setShowNoAssignmentFileModal(true);
            return;
          }

          if (prepared.status !== 'waiting_confirmation') {
            throw new Error(
              prepared.error ||
              'MUAWIN could not prepare the existing assignment document.'
            );
          }

          const initialDraft = prepared.draft || {};
          const initialCandidate =
            (prepared.candidates || []).find(
              (item: any) =>
                item.file_name === initialDraft.file_name
            ) || {};

          const initialWeek = initialDraft.week_number ?? '';

          setPendingFileAssignment(prepared);
          setFileAssignmentFileName(
            initialDraft.file_name || initialCandidate.file_name || ''
          );
          setFileAssignmentWeek(String(initialWeek || ''));
          setFileAssignmentTitle(
            initialDraft.title ?? initialCandidate.title ?? ''
          );
          setFileAssignmentStartDate(
            initialDraft.start_date ?? initialCandidate.start_date ?? ''
          );
          setFileAssignmentDueDate(
            initialDraft.due_date ?? initialCandidate.due_date ?? ''
          );

          const initialMarks =
            initialDraft.total_marks ?? initialCandidate.total_marks;

          setFileAssignmentMarks(
            initialMarks !== undefined && initialMarks !== null
              ? String(initialMarks)
              : ''
          );          setShowNoAssignmentFileModal(false);
          setIsSubmittedToApproval(false);
          setShowWorkflowPlan(false);

          addToast(
            'info',
            'Confirm Assignment Document',
            'Review the selected document and its extracted details before sending it to Approvals.'
          );
          return;
        }

        const workflow = buildWorkflowFromInterpretation(
          interpretations[0],
          0
        );

        console.log(
          '[Assistant] Preparing single workflow:',
          workflow
        );

        const backendWorkflow = await addWorkflow(workflow);

        if (!backendWorkflow?.id) {
          throw new Error(
            'MUAWIN could not prepare the workflow.'
          );
        }

        createdWorkflows.push(backendWorkflow);
      } else {
        // ------------------------------------------------------
        // COMBINED LECTURE + ASSIGNMENT WORKFLOW
        // Submit exactly ONE combined workflow.
        // ------------------------------------------------------
        const lectureIndex = lectureInterpretationIndex;
        const assignmentIndex = assignmentInterpretationIndex;

        if (lectureIndex === -1 || assignmentIndex === -1) {
          throw new Error(
            'MUAWIN could not identify both the lecture and assignment actions. Please rephrase the instruction.'
          );
        }

        const lectureInterpretation = interpretations[lectureIndex];
        const assignmentInterpretation =
          interpretations[assignmentIndex];

        if (!lectureInterpretation || !assignmentInterpretation) {
          throw new Error(
            'The lecture or assignment interpretation is incomplete.'
          );
        }

        const lecturePayload = {
          ...(editedPayloads[lectureIndex] ||
            lectureInterpretation.suggestedPayload ||
            {}),
          workflowType: 'lecture',
          instruction: lectureInterpretation.rawInstruction,
        };

        const assignmentPayload = {
          ...(editedPayloads[assignmentIndex] ||
            assignmentInterpretation.suggestedPayload ||
            {}),
          workflowType: 'assignment',
          instruction: assignmentInterpretation.rawInstruction,
        };

        const combinedInstruction =
          prompt.trim() ||
          [
            lectureInterpretation.rawInstruction,
            assignmentInterpretation.rawInstruction,
          ]
            .filter(Boolean)
            .join(' and ');

        const combinedWorkflow = buildWorkflowFromInterpretation(
          lectureInterpretation,
          lectureIndex
        );

        combinedWorkflow.id = `cwf-${Date.now()}`;

        combinedWorkflow.title =
          `${lectureInterpretation.suggestedTitle} + ${assignmentInterpretation.suggestedTitle}`;

        // Keep the actionType created by the existing builder.
        // The workflowType identifies this as a combined workflow.
        combinedWorkflow.workflowType = 'combined' as any;

        combinedWorkflow.instructionText = combinedInstruction;

        combinedWorkflow.source =
          `Combined Assistant Prompt: "${combinedInstruction.substring(
            0,
            120
          )}${combinedInstruction.length > 120 ? '...' : ''}"`;

        combinedWorkflow.payload = {
          ...lecturePayload,
          workflowType: 'combined',
          instruction: combinedInstruction,
          combinedWorkflow: true,
          dependencyType: 'lecture_then_assignment',
          lecture: lecturePayload,
          assignment: assignmentPayload,
        };

        console.log(
          '[Assistant] Preparing ONE combined workflow:',
          combinedWorkflow
        );

        const backendWorkflow = await addWorkflow(combinedWorkflow);

        if (!backendWorkflow?.id) {
          throw new Error(
            'MUAWIN could not prepare the combined workflow.'
          );
        }

        createdWorkflows.push(backendWorkflow);

        console.log(
          '[Assistant] Combined workflow prepared:',
          backendWorkflow
        );
      }

      if (createdWorkflows.length === 0) {
  throw new Error(
    'MUAWIN did not return a prepared workflow.'
  );
}

const clarificationWorkflow = createdWorkflows.find(
  (workflow) =>
    (workflow as any).status === 'needs_clarification'
);

if (clarificationWorkflow) {
  setPendingAssignmentClarification(
    clarificationWorkflow
  );

  setAssignmentClarificationAnswer('');
  setIsSubmittedToApproval(false);
  setShowWorkflowPlan(false);

  addToast(
    'info',
    'Assignment Details Required',
    (clarificationWorkflow as any).clarification_question ||
      'Please provide the missing assignment details.'
  );

  return;
}

setIsSubmittedToApproval(true);
      setShowWorkflowPlan(true);

      addToast(
        'success',
        interpretations.length > 1
          ? 'Combined Workflow Prepared'
          : 'Workflow Prepared',
        interpretations.length > 1
          ? 'The combined lecture and assignment workflow is ready for teacher review.'
          : 'The workflow is ready for teacher approval.'
      );

      console.log(
        '[Assistant] Workflow preparation complete:',
        createdWorkflows
      );
    } catch (error: any) {
      console.error(
        '[Assistant] Failed to prepare workflow:',
        error
      );

      addToast(
        'error',
        'Workflow Preparation Failed',
        error?.message ||
          'MUAWIN could not prepare the requested workflow.'
      );
    } finally {
      setIsProcessing(false);
      submissionLockRef.current = false;
    }
  };

    // ============================================================
  // CONFIRM EXISTING ASSIGNMENT DOCUMENT
  // ============================================================

  const handleConfirmFileAssignment = async () => {
    if (
      !pendingFileAssignment?.id ||
      !fileAssignmentFileName ||
      isProcessing
    ) {
      return;
    }

    const parsedWeek = Number(fileAssignmentWeek);
    if (!Number.isInteger(parsedWeek) || parsedWeek < 1) {
      addToast(
        'error',
        'Week Required',
        'Please select or enter the Moellim week for this assignment.'
      );
      return;
    }

    setIsProcessing(true);

    try {
      const confirmed = await fileAssignmentService.confirm(
        pendingFileAssignment.id,
        {
          file_name: fileAssignmentFileName,
          week_number: parsedWeek,
          title: fileAssignmentTitle.trim() || undefined,
          start_date: fileAssignmentStartDate || undefined,
          due_date: fileAssignmentDueDate || undefined,
          total_marks:
            fileAssignmentMarks.trim() &&
            Number.isFinite(Number(fileAssignmentMarks))
              ? Number(fileAssignmentMarks)
              : undefined,
        }
      );

      if (confirmed.status !== 'waiting_approval') {
        throw new Error(
          confirmed.error ||
          'The assignment document could not be confirmed.'
        );
      }

      setPendingFileAssignment(null);
      setIsSubmittedToApproval(true);
      setShowWorkflowPlan(true);

      addToast(
        'success',
        'Assignment Ready for Approval',
        'The existing assignment document has been staged in Approvals. It has not been uploaded to Moellim yet.'
      );
    } catch (error: any) {
      addToast(
        'error',
        'Confirmation Failed',
        error?.message || 'Could not confirm the assignment document.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateNewAssignmentInstead = () => {
    setShowNoAssignmentFileModal(false);
    setPendingFileAssignment(null);

    const generationInstruction =
      `Create a new assignment using the relevant lecture content for ${selectedCourse?.title || selectedCourse?.code || 'the selected course'}.`;

    setPrompt(generationInstruction);
    handleInterpret(generationInstruction);
  };

  // ============================================================
  // SUBMIT ASSIGNMENT CLARIFICATION
  // ============================================================

  const handleAssignmentClarification = async () => {
    if (
      !pendingAssignmentClarification?.id ||
      !assignmentClarificationAnswer.trim() ||
      isProcessing
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      const updated = await clarifyAssignmentWorkflow(
        pendingAssignmentClarification.id,
        assignmentClarificationAnswer.trim()
      );

      if (!updated) {
        return;
      }

      if (updated.status === 'needs_clarification') {
        setPendingAssignmentClarification(updated);
        setAssignmentClarificationAnswer('');
        return;
      }

      if (updated.status === 'waiting_approval') {
        setPendingAssignmentClarification(null);
        setAssignmentClarificationAnswer('');
        setIsSubmittedToApproval(true);
        setShowWorkflowPlan(true);

        addToast(
          'success',
          'Assignment Ready',
          'Your assignment is ready for teacher approval.'
        );
      }
    } catch (error: any) {
      console.error(
        '[Assistant] Clarification submission failed:',
        error
      );

      addToast(
        'error',
        'Clarification Failed',
        error?.message || 'Could not submit assignment details.'
      );
    } finally {
      setIsProcessing(false);
    }
  };
  // ============================================================
  // RESET CURRENT COMMAND
  // ============================================================

  const handleReset =
    () => {
      submissionLockRef.current =
        false;

      setInterpretations([]);

      setEditedPayloads({});

      setActiveInterpretationIndex(
        0
      );

      setIsSubmittedToApproval(
        false
      );

      setIsEditingPayload(
        false
      );

      setShowWorkflowPlan(
        false
      );

      setIsProcessing(
        false
      );
    };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200">

      {/* ======================================================
          OPERATING MODES BANNER
      ====================================================== */}

      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-sm relative overflow-hidden">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

          <div className="flex items-start sm:items-center gap-3">

            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>

            <div>

              <div className="flex items-center gap-2">

                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/30 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded">
                  Operating Mode
                </span>

                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">

                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>

                  Command Mode (Active)

                </span>

              </div>

              <h3 className="text-base font-bold text-white mt-0.5">
                AI Assistant - Direct Text & Spoken Command Mode
              </h3>

              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                Give MUAWIN a direct prompt or voice command anytime to prepare multi-step academic workflows.
                Unlike Class Mode which runs automatically on your scheduled timetable, Command Mode handles
                direct on-demand instructor directives.
              </p>

            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">

            <button
              onClick={() =>
                navigate(
                  '/lecture',
                  {
                    state: {
                      courseId:
                        selectedCourse?.id,
                    },
                  }
                )
              }
              className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Radio className="w-3.5 h-3.5 text-rose-400" />

              <span>
                Open Class Mode (Timetable)
              </span>
            </button>

            <button
              onClick={() =>
                navigate(
                  '/approvals'
                )
              }
              className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1"
            >
              <span>
                Pending Approvals
              </span>

              <ArrowRight className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>

      </div>

      {/* ======================================================
          ACTIVE COURSE
      ====================================================== */}

      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl bg-blue-100/70 border border-blue-200 flex items-center justify-center text-blue-700 font-bold shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>

            <div>

              <div className="flex items-center gap-2">

                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  Active Course Context
                </span>

                <span className="text-xs text-slate-400">
                  -
                </span>

                <span className="text-xs font-semibold text-slate-600">
                  Assigned to {user?.name}
                </span>

              </div>

              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {selectedCourse
                  ? `${selectedCourse.code} - ${selectedCourse.title}`
                  : 'No Course Selected'}
              </h3>

              <p className="text-[11px] text-slate-500">
                Directives automatically bind to{' '}
                {selectedCourse
                  ? `${selectedCourse.code} (${selectedCourse.section})`
                  : 'your course'}{' '}
                unless an explicit course is named.
              </p>

            </div>

          </div>

          <div className="flex items-center gap-2 shrink-0">

            <span className="text-xs font-medium text-slate-500 hidden sm:inline">
              Switch Course:
            </span>

            <div className="flex flex-wrap gap-1.5">

              {courses.map(
                (c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      selectCourse(
                        c.id
                      )
                    }
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                      selectedCourse?.id ===
                      c.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {c.code} ({c.section})
                  </button>
                )
              )}

            </div>

          </div>

        </div>

      </div>

{/* ======================================================
    COMMAND INTERFACE
====================================================== */}

<div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3 sm:space-y-4">

  {pendingFileAssignment?.status === 'waiting_confirmation' && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Confirm Existing Assignment Document
              </h3>
            </div>

            <p className="mb-4 text-xs text-slate-600">
              MUAWIN searched only the saved folder for the selected course.
              Review the extracted details and confirm before this item enters Approvals.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Assignment document
                </label>
                <select
                  value={fileAssignmentFileName}
                  onChange={(event) => {
                    const selectedName = event.target.value;
                    setFileAssignmentFileName(selectedName);
                    const candidate = (pendingFileAssignment.candidates || []).find(
                      (item: any) => item.file_name === selectedName
                    );
                    if (candidate) {
                      setFileAssignmentTitle(candidate.title || '');
                      setFileAssignmentStartDate(candidate.start_date || '');
                      setFileAssignmentDueDate(candidate.due_date || '');
                      setFileAssignmentMarks(
                        candidate.total_marks !== undefined
                          ? String(candidate.total_marks)
                          : ''
                      );
                      setFileAssignmentWeek(String(candidate.week_number ?? ''));
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                >
                  {(pendingFileAssignment.candidates || []).map((candidate: any) => (
                    <option key={candidate.file_name} value={candidate.file_name}>
                      {candidate.file_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Assignment title
                </label>
                <input
                  value={fileAssignmentTitle}
                  onChange={(event) => setFileAssignmentTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                  placeholder="Assignment title"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Moellim week
                </label>
                <input
                  type="number"
                  min="1"
                  value={fileAssignmentWeek}
                  onChange={(event) => setFileAssignmentWeek(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                  placeholder="Week number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Allow submissions from
                </label>
                <input
                  type="date"
                  value={fileAssignmentStartDate}
                  onChange={(event) => setFileAssignmentStartDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Due date
                </label>
                <input
                  type="date"
                  value={fileAssignmentDueDate}
                  onChange={(event) => setFileAssignmentDueDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Total marks
                </label>
                <input
                  type="number"
                  min="0"
                  value={fileAssignmentMarks}
                  onChange={(event) => setFileAssignmentMarks(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                  placeholder="Marks"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingFileAssignment(null);
                  setFileAssignmentFileName('');
                  setFileAssignmentWeek('');
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing || !fileAssignmentFileName}
                onClick={handleConfirmFileAssignment}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {isProcessing ? 'Confirming...' : 'Confirm & Send to Approvals'}
              </button>
            </div>
          </div>
        )}

        {pendingAssignmentClarification && (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900">
        Assignment Details Required
      </h3>

      <p className="mt-2 text-sm text-slate-700">
        {(pendingAssignmentClarification as any)
          .clarification_question ||
          'Please provide the missing assignment details.'}
      </p>

      <textarea
        value={assignmentClarificationAnswer}
        onChange={(e) =>
          setAssignmentClarificationAnswer(e.target.value)
        }
        placeholder="Enter the required details..."
        rows={3}
        className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        type="button"
        onClick={handleAssignmentClarification}
        disabled={
          isProcessing ||
          !assignmentClarificationAnswer.trim()
        }
        className="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isProcessing ? 'Preparing Assignment...' : 'Submit Details'}
      </button>
    </div>
  )}

  <div className="flex items-center justify-between">

    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">

      <Sliders className="w-3.5 h-3.5 text-blue-600" />

      <span>
        MUAWIN Command Bar
      </span>

    </label>

    <span className="text-[11px] text-slate-400 font-medium">
      Type or speak an instruction
    </span>

  </div>

        {/* ====================================================
            MOBILE COMMAND BAR
        ==================================================== */}

        <div className="sm:hidden bg-slate-50 border border-slate-300 rounded-2xl p-3.5 space-y-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">

          <div className="flex items-start gap-2">

            <div
              className="relative"
              ref={dropdownRef}
            >

              <button
                type="button"
                onClick={() =>
                  setShowTemplateDropdown(
                    !showTemplateDropdown
                  )
                }
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 shadow-2xs hover:bg-slate-100 transition-colors shrink-0 mt-0.5"
              >
                <Plus className="w-4 h-4" />
              </button>

              {showTemplateDropdown && (
                <div className="absolute left-0 top-10 w-72 max-w-[calc(100vw-3rem)] bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-30 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-1">

                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Quick Templates
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(
                        'Upload Lecture 2 and create an assignment.'
                      );

                      setShowTemplateDropdown(
                        false
                      );
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-blue-50 text-slate-800 transition-colors"
                  >
                    <span className="font-bold text-blue-700 block">
                      Ã¢Å¡Â¡ Multi-Action Directive
                    </span>

                    <span className="text-[11px] text-slate-500">
                      "Upload Lecture 2 and create an assignment."
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(
                        `Create Assignment 1 for ${
                          selectedCourse?.code ||
                          'Parallel and Distributed Computing'
                        } due next Friday, 20 marks`
                      );

                      setShowTemplateDropdown(
                        false
                      );
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-slate-800 transition-colors"
                  >
                    <span className="font-bold text-slate-800 block">
                      Create Assignment
                    </span>

                    <span className="text-[11px] text-slate-500">
                      Stage homework task with questions & rubric
                    </span>
                  </button>

                </div>
              )}

            </div>

            <textarea
              rows={2}
              dir="auto"
              value={prompt}
              onChange={(e) =>
                setPrompt(
                  e.target.value
                )
              }
              placeholder="What would you like MUAWIN to do?"
              className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden resize-none leading-relaxed"
            />

          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">

            <button
            type="button"
            onClick={handleToggleLiveTranscription}
            disabled={isProcessing}
            className={`px-3 py-2 flex items-center gap-1.5 rounded-xl transition-all shrink-0 text-xs font-semibold cursor-pointer ${
              voiceState === 'listening'
                ? 'bg-rose-50 border border-rose-300 text-rose-700'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 shadow-2xs'
            }`}
          >
            <Mic
              className={`w-3.5 h-3.5 ${
                voiceState === 'listening'
                  ? 'text-rose-600'
                  : 'text-rose-500'
              }`}
            />

            <span>
              {voiceState === 'listening'
                ? 'Stop Listening'
                : voiceState === 'processing'
                ? 'Connecting...'
                : voiceState === 'result'
                ? 'Speak Again'
                : 'Speak'}
            </span>
          </button>

            <button
              type="button"
              onClick={() =>
                handleInterpret()
              }
              disabled={
                isProcessing ||
                !prompt.trim()
              }
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >

              {isProcessing ? (
                <span>
                  Analyzing...
                </span>
              ) : (
                <>
                  <span>
                    Send
                  </span>

                  <Send className="w-3.5 h-3.5" />
                </>
              )}

            </button>

          </div>

        </div>

        {/* ====================================================
            DESKTOP COMMAND BAR
        ==================================================== */}

        <div className="hidden sm:flex relative items-center gap-2 p-1.5 bg-slate-50 border border-slate-300/90 rounded-2xl shadow-2xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">

          <div
            className="relative"
            ref={dropdownRef}
          >

            <button
              type="button"
              onClick={() =>
                setShowTemplateDropdown(
                  !showTemplateDropdown
                )
              }
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 text-slate-600 shadow-2xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>

            {showTemplateDropdown && (
              <div className="absolute left-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-30 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-1">

                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Quick Directive Templates
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPrompt(
                      'Upload Lecture 2 and create an assignment.'
                    );

                    setShowTemplateDropdown(
                      false
                    );
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-blue-50 text-slate-800 transition-colors"
                >
                  <span className="font-bold text-blue-700 block">
                    Ã¢Å¡Â¡ Multi-Action Directive
                  </span>

                  <span className="text-[11px] text-slate-500">
                    "Upload Lecture 2 and create an assignment."
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPrompt(
                      `Create Assignment 1 for ${
                        selectedCourse?.code ||
                        'Parallel and Distributed Computing'
                      } due next Friday, 20 marks`
                    );

                    setShowTemplateDropdown(
                      false
                    );
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-slate-800 transition-colors"
                >
                  <span className="font-bold text-slate-800 block">
                    Create Assignment
                  </span>

                  <span className="text-[11px] text-slate-500">
                    Stage homework task with questions & rubric
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPrompt(
                      `Create a reminder for the quiz on Friday for ${
                        selectedCourse?.code ||
                        'PDC'
                      }`
                    );

                    setShowTemplateDropdown(
                      false
                    );
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-slate-800 transition-colors"
                >
                  <span className="font-bold text-slate-800 block">
                    Post Reminder Notice
                  </span>

                  <span className="text-[11px] text-slate-500">
                    Notice board broadcast for students
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPrompt(
                      "Mark today's lecture as completed."
                    );

                    setShowTemplateDropdown(
                      false
                    );
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-slate-800 transition-colors"
                >
                  <span className="font-bold text-slate-800 block">
                    Mark Lecture Completed
                  </span>

                  <span className="text-[11px] text-slate-500">
                    Update Moellim syllabus logbook
                  </span>
                </button>

              </div>
            )}

          </div>

          <input
            type="text"
            dir="auto"
              value={prompt}
            onChange={(e) =>
              setPrompt(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (
                e.key ===
                'Enter'
              ) {
                e.preventDefault();
                handleInterpret();
              }
            }}
            placeholder="Tell MUAWIN what you want to do (e.g. Upload Lecture 2 and create an assignment)..."
            className="flex-1 bg-transparent px-2 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden min-w-0"
          />

          <button
            type="button"
            onClick={() => {
              if (
                voiceState ===
                'idle'
              ) {
                handleVoiceCommand();
              } else {
                setShowVoiceDrawer(
                  !showVoiceDrawer
                );
              }
            }}
            className="px-3 py-2 flex items-center gap-1.5 rounded-xl transition-all shrink-0 text-xs font-semibold cursor-pointer bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 shadow-2xs"
          >
            <Mic className="w-3.5 h-3.5 text-rose-500" />

            <span>
              {voiceState ===
              'listening'
                ? 'Listening...'
                : voiceState ===
                  'processing'
                ? 'Processing...'
                : 'Speak'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleInterpret()
            }
            disabled={
              isProcessing ||
              !prompt.trim()
            }
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {isProcessing ? (
              <span>
                Analyzing...
              </span>
            ) : (
              <>
                <span>
                  Send
                </span>

                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>

        </div>

        {/* ====================================================
            VOICE DRAWER
        ==================================================== */}

        {showVoiceDrawer && (
          <div
            ref={
              voiceDrawerRef
            }
            className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-3 animate-in fade-in duration-150"
          >

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-2">

                <Volume2 className="w-4 h-4 text-blue-700" />

                <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  Voice Command Studio
                </span>

                <span className="text-[10px] bg-blue-200/80 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                  Live Speech-to-Text
                </span>
              </div>

              <button
                onClick={() =>
                  setShowVoiceDrawer(
                    false
                  )
                }
                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Close
              </button>

            </div>

            {voiceState ===
              'listening' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-xl border border-rose-200 shadow-2xs">

                <div className="flex items-center gap-3">

                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 animate-pulse">
                    <span className="w-3 h-3 rounded-full bg-rose-600"></span>
                  </div>

                  <div>

                    <span className="text-xs font-bold text-rose-700 block">
                      Listening to Teacher Microphone...
                    </span>

                    <span className="text-xs text-slate-600 italic">
                      "{voiceTranscript || 'Speaking instruction...'}"
                    </span>

                  </div>

                </div>

              </div>
            )}

            {voiceState ===
              'processing' && (
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-amber-200 shadow-2xs">

                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 animate-spin">
                  <Sparkles className="w-4 h-4" />
                </div>

                <div>

                  <span className="text-xs font-bold text-amber-800 block">
                    Understanding your instruction...
                  </span>

                  <span className="text-xs text-slate-500">
                    Transcribing speech & extracting multi-action intent parameters...
                  </span>

                </div>

              </div>
            )}

            {voiceState ===
              'result' && (
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">

                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                </div>

                <div>

                  <span className="text-xs font-bold text-emerald-800 block">
                    Voice Instruction Transcribed
                  </span>

                  <span className="text-xs text-slate-800 font-medium italic">
                    Teacher said: "{voiceTranscript}"
                  </span>

                </div>

              </div>
            )}

            {voiceState ===
              'idle' && (
              <div className="space-y-2">

                <p className="text-xs text-slate-600">
                  Speak your instruction. MUAWIN will transcribe it into the command bar,
                  where you can review and edit it before sending.
                </p>

              </div>
            )}

          </div>
        )}

        {/* ====================================================
            QUICK PROMPTS
        ==================================================== */}

        <div>

          <p className="text-[11px] font-semibold text-slate-400 mb-1.5">
            Quick Prompts:
          </p>

          <div className="flex flex-wrap gap-2">

            {getSuggestions().map(
              (
                chip,
                idx
              ) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(
                      chip
                    );

                    handleInterpret(
                      chip
                    );
                  }}
                  className="text-[11px] text-slate-600 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-transparent px-3 py-1.5 rounded-lg transition-colors text-left"
                >
                  {chip}
                </button>
              )
            )}

          </div>

        </div>

      </div>

      {/* ======================================================
          MULTI-ACTION SUMMARY
      ====================================================== */}

      {interpretations.length >
        1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">

          <div className="flex items-start justify-between gap-3">

            <div className="flex items-start gap-3">

              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>

              <div>

                <h4 className="text-sm font-bold text-blue-950">
                  Multi-Action Instruction Detected
                </h4>

                <p className="text-xs text-blue-800 mt-0.5">
                  MUAWIN decomposed your instruction into{' '}
                  <strong>
                    {interpretations.length}
                  </strong>{' '}
                  workflows.
                </p>

              </div>

            </div>

            <button
              onClick={
                handleReset
              }
              disabled={isProcessing}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>

          </div>

          {/* ----------------------------------------------------
              DEPENDENCY NOTICE
          ---------------------------------------------------- */}

          {hasLectureAssignmentDependency && (
            <div className="mt-3 p-3 rounded-xl bg-white border border-blue-200">

              <div className="flex items-start gap-2">

                <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />

                <div>

                  <p className="text-xs font-bold text-blue-900">
                    Sequential Workflow Dependency
                  </p>

                  <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                    The lecture will be uploaded and verified first.
                    Only after successful verification will MUAWIN prepare
                    the dependent assignment for a separate teacher approval.
                  </p>

                </div>

              </div>

            </div>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">

            {interpretations.map(
              (
                item,
                index
              ) => (
                <button
                  key={index}
                  type="button"
                  onClick={() =>
                    setActiveInterpretationIndex(
                      index
                    )
                  }
                  className={`text-left p-3 rounded-xl border transition-all ${
                    activeInterpretationIndex ===
                    index
                      ? 'bg-white border-blue-400 shadow-sm'
                      : 'bg-blue-100/40 border-blue-200 hover:bg-white'
                  }`}
                >

                  <div className="flex items-center gap-2">

                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>

                    <div>

                      <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600">
                        {item.workflowType}
                      </span>

                      <p className="text-xs font-bold text-slate-900">
                        {item.intent}
                      </p>

                    </div>

                  </div>

                </button>
              )
            )}

          </div>

        </div>
      )}

      {/* ======================================================
          INTENT CARDS
      ====================================================== */}

      {interpretations.length >
        0 && (
        <div className="space-y-4">

          {interpretations.map(
            (
              interpretation,
              index
            ) => (
              <div
                key={`${interpretation.workflowType}-${index}`}
                className="relative"
              >

                {interpretations.length >
                  1 && (
                  <div className="mb-2 flex items-center gap-2">

                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>

                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Workflow {index + 1}:{' '}
                      {interpretation.intent}
                    </span>

                  </div>
                )}

                <IntentCard
                  interpretation={
                    interpretation
                  }

                  onReviewWorkflow={() => {
                    setActiveInterpretationIndex(
                      index
                    );

                    setShowWorkflowPlan(
                      true
                    );
                  }}

                  /*
                   * For multi-action commands, the dedicated
                   * combined submit bar is used.
                   *
                   * This prevents each individual IntentCard
                   * from independently creating backend
                   * workflows.
                   */
                  onSubmitForApproval={
                    interpretations.length === 1
                      ? handleSendToApprovals
                      : undefined
                  }

                  isAlreadyPlanned={
                    showWorkflowPlan &&
                    activeInterpretationIndex ===
                      index
                  }
                />

              </div>
            )
          )}

        </div>
      )}

      {/* ======================================================
          MULTI-ACTION SUBMIT BAR
      ====================================================== */}

      {interpretations.length > 1 &&
        !showWorkflowPlan && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-4">

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

            <div className="flex items-start gap-2.5">

              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />

              <div>

                <p className="text-sm font-bold text-slate-900">
                  Ready for Teacher Approval
                </p>

                <p className="text-xs text-slate-500 mt-0.5">
                  {hasLectureAssignmentDependency
                    ? 'Submit the lecture workflow now. The dependent assignment will remain gated until the lecture is successfully verified.'
                    : 'Review the detected workflows before submitting them for approval.'}
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={
                handleSendToApprovals
              }
              disabled={
                isProcessing ||
                isSubmittedToApproval
              }
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0"
            >

              {isProcessing ? (
                <>
                  <span>
                    Preparing...
                  </span>
                </>
              ) : isSubmittedToApproval ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />

                  <span>
                    Submitted
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Submit Combined Workflow for Approval
                  </span>

                  <ArrowRight className="w-4 h-4" />
                </>
              )}

            </button>

          </div>

        </div>
      )}

      {/* ======================================================
          DETAILED WORKFLOW PLAN
      ====================================================== */}

      {activeInterpretation &&
        showWorkflowPlan && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-98 duration-150">

            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

              <div>

                <div className="flex items-center gap-2 flex-wrap">

                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded">
                    Gate 1 & 2: Intent Understood & Planned
                  </span>

                  <span className="text-xs text-blue-200">
                    {(
                      activeInterpretation.confidence *
                      100
                    ).toFixed(0)}
                    % Match Confidence
                  </span>

                </div>

                <h4 className="text-base sm:text-lg font-bold text-white mt-1">
                  {
                    activeInterpretation.suggestedTitle
                  }
                </h4>

              </div>

              <div className="flex items-center gap-2 shrink-0">

                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/10 text-white border border-white/20">
                  Action:{' '}
                  {
                    activeInterpretation.intent
                  }
                </span>

              </div>

            </div>

            <div className="p-5 sm:p-6 space-y-6">

              {/* ==================================================
                  TARGET
              ================================================== */}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 text-xs">

                <div>

                  <span className="text-slate-400 block font-semibold text-[10px] uppercase">
                    Verified Target Course
                  </span>

                  <span className="font-bold text-blue-950">
                    {
                      activeInterpretation.courseCode
                    }{' '}
                    -{' '}
                    {
                      activeInterpretation.courseName
                    }
                  </span>

                </div>

                <div>

                  <span className="text-slate-400 block font-semibold text-[10px] uppercase">
                    Moellim Section
                  </span>

                  <span className="font-bold text-slate-800">
                    {
                      selectedCourse?.section ||
                      'Section F'
                    }
                  </span>

                </div>

                <div>

                  <span className="text-slate-400 block font-semibold text-[10px] uppercase">
                    Authorizing Teacher
                  </span>

                  <span className="font-bold text-slate-800">
                    {user?.name}
                  </span>

                </div>

              </div>

              {/* ==================================================
                  PARAMETERS
              ================================================== */}

              <div className="space-y-3">

                <div className="flex items-center justify-between">

                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">

                    <FileText className="w-3.5 h-3.5 text-blue-600" />

                    <span>
                      Extracted Workflow Parameters
                    </span>

                  </h5>

                  <button
                    type="button"
                    onClick={() =>
                      setIsEditingPayload(
                        !isEditingPayload
                      )
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >

                    <Edit3 className="w-3 h-3" />

                    <span>
                      {isEditingPayload
                        ? 'Done Editing'
                        : 'Modify Parameters'}
                    </span>

                  </button>

                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">

                  {isEditingPayload ? (
                    <div className="space-y-3 text-xs">

                      {/* TITLE */}

                      <div>

                        <label className="block font-bold text-slate-600 mb-1">
                          Title
                        </label>

                        <input
                          type="text"
                          value={
                            activeEditedPayload.title ||
                            activeEditedPayload.assignmentTitle ||
                            ''
                          }
                          onChange={(
                            e
                          ) =>
                            updateActivePayload(
                              {
                                title:
                                  e.target.value,

                                assignmentTitle:
                                  e.target.value,
                              }
                            )
                          }
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />

                      </div>

                      {/* DUE DATE */}

                      {(activeEditedPayload.dueDate !==
                        undefined ||
                        activeEditedPayload.deadline !==
                          undefined) && (
                        <div>

                          <label className="block font-bold text-slate-600 mb-1">
                            Due Date
                          </label>

                          <input
                            type="text"
                            value={
                              activeEditedPayload.dueDate ||
                              activeEditedPayload.deadline ||
                              ''
                            }
                            onChange={(
                              e
                            ) =>
                              updateActivePayload(
                                {
                                  dueDate:
                                    e.target.value,

                                  deadline:
                                    e.target.value,
                                }
                              )
                            }
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                          />

                        </div>
                      )}

                      {/* MARKS */}

                      {(activeEditedPayload.totalMarks !==
                        undefined ||
                        activeEditedPayload.marks !==
                          undefined) && (
                        <div>

                          <label className="block font-bold text-slate-600 mb-1">
                            Total Marks
                          </label>

                          <input
                            type="number"
                            value={
                              activeEditedPayload.totalMarks ??
                              activeEditedPayload.marks ??
                              0
                            }
                            onChange={(
                              e
                            ) => {
                              const value =
                                parseInt(
                                  e.target.value,
                                  10
                                ) || 0;

                              updateActivePayload(
                                {
                                  totalMarks:
                                    value,

                                  marks:
                                    value,
                                }
                              );
                            }}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                          />

                        </div>
                      )}

                      {/* DESCRIPTION */}

                      <div>

                        <label className="block font-bold text-slate-600 mb-1">
                          Description / Instructions
                        </label>

                        <textarea
                          rows={3}
                          value={
                            activeEditedPayload.description ||
                            activeEditedPayload.message ||
                            ''
                          }
                          onChange={(
                            e
                          ) =>
                            updateActivePayload(
                              {
                                description:
                                  e.target.value,

                                message:
                                  e.target.value,
                              }
                            )
                          }
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />

                      </div>

                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">

                      {/* TITLE */}

                      <div>

                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Item Title
                        </span>

                        <span className="font-semibold text-slate-900">
                          {activeEditedPayload.title ||
                            activeEditedPayload.assignmentTitle ||
                            activeInterpretation.suggestedTitle}
                        </span>

                      </div>

                      {/* DUE DATE */}

                      {(activeEditedPayload.dueDate ||
                        activeEditedPayload.deadline) && (
                        <div>

                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Scheduled Due Date
                          </span>

                          <span className="font-semibold text-slate-900 flex items-center gap-1">

                            <Calendar className="w-3 h-3 text-slate-500" />

                            <span>
                              {
                                activeEditedPayload.dueDate ||
                                activeEditedPayload.deadline
                              }
                            </span>

                          </span>

                        </div>
                      )}

                      {/* MARKS */}

                      {(activeEditedPayload.totalMarks ||
                        activeEditedPayload.marks) && (
                        <div>

                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Assessment Weight
                          </span>

                          <span className="font-semibold text-slate-900">
                            {
                              activeEditedPayload.totalMarks ||
                              activeEditedPayload.marks
                            }{' '}
                            Marks
                          </span>

                        </div>
                      )}

                      {/* QUESTIONS */}

                      {Array.isArray(
                        activeEditedPayload.questions
                      ) && (
                        <div className="sm:col-span-2 pt-2 border-t border-slate-200/60">

                          <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1.5">
                            Generated Assessment Questions (
                            {
                              activeEditedPayload
                                .questions
                                .length
                            }
                            )
                          </span>

                          <ul className="space-y-1 text-slate-800 list-decimal list-inside">

                            {activeEditedPayload.questions.map(
                              (
                                q: string,
                                qIdx: number
                              ) => (
                                <li
                                  key={
                                    qIdx
                                  }
                                  className="leading-relaxed font-medium"
                                >
                                  {q}
                                </li>
                              )
                            )}

                          </ul>

                        </div>
                      )}

                      {/* INSTRUCTION */}

                      <div className="sm:col-span-2 pt-2 border-t border-slate-200/60">

                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Instruction Details
                        </span>

                        <p className="text-slate-700 mt-0.5">
                          {activeEditedPayload.description ||
                            activeEditedPayload.message ||
                            activeInterpretation.rawInstruction ||
                            'No additional details required.'}
                        </p>

                      </div>

                    </div>
                  )}

                </div>

              </div>

              {/* ==================================================
                  DEPENDENCY DETAILS
              ================================================== */}

              {isMultiAction &&
                activeInterpretation.workflowType ===
                  'assignment' &&
                hasLectureAssignmentDependency && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">

                    <div className="flex items-start gap-2.5">

                      <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />

                      <div>

                        <p className="text-xs font-bold text-amber-900">
                          Assignment Waiting for Lecture Verification
                        </p>

                        <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                          This assignment depends on the lecture workflow.
                          MUAWIN will not create it in Moellim yet.
                          The lecture must first be approved, uploaded,
                          and verified. The assignment will then enter its
                          own approval stage.
                        </p>

                      </div>

                    </div>

                  </div>
                )}

              {/* ==================================================
                  EXECUTION STEPS
              ================================================== */}

              <div>

                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">

                  <Clock className="w-3.5 h-3.5 text-blue-600" />

                  <span>
                    Proposed Execution Stages (
                    {
                      activeInterpretation
                        .suggestedSteps
                        .length
                    }{' '}
                    Steps)
                  </span>

                </h5>

                <div className="space-y-2">

                  {activeInterpretation.suggestedSteps.map(
                    (
                      step,
                      index
                    ) => (
                      <div
                        key={
                          step.id
                        }
                        className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs"
                      >

                        <div className="flex items-center gap-2.5">

                          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">
                            {index + 1}
                          </span>

                          <div>

                            <span className="font-bold text-slate-800">
                              {
                                step.title
                              }
                            </span>

                            <span className="text-slate-500 text-[11px] block">
                              {
                                step.description
                              }
                            </span>

                          </div>

                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            step.title
                              .toLowerCase()
                              .includes(
                                'approval'
                              )
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {step.title
                            .toLowerCase()
                            .includes(
                              'approval'
                            )
                            ? 'Approval Required'
                            : 'Automated Step'}
                        </span>

                      </div>
                    )
                  )}

                </div>

              </div>

              {/* ==================================================
                  APPROVAL
              ================================================== */}

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                <div className="flex items-center gap-2 text-xs text-slate-600">

                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />

                  <span>
                    Instructor confirmation is required before MUAWIN performs any action on Moellim.
                  </span>

                </div>

                <div className="flex items-center gap-2 shrink-0">

                  {isSubmittedToApproval ? (
                    <div className="flex items-center gap-2">

                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-1.5">

                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />

                        <span>
                          Staged in Approvals Queue
                        </span>

                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            '/approvals'
                          )
                        }
                        className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1"
                      >

                        <span>
                          Review in Approvals
                        </span>

                        <ArrowRight className="w-3.5 h-3.5" />

                      </button>

                    </div>
                  ) : (
                    /*
                     * SINGLE WORKFLOW:
                     * keep the detailed-plan submit button.
                     *
                     * MULTI-ACTION:
                     * use the dedicated combined submit bar.
                     */
                    interpretations.length === 1 ? (
                      <button
                        type="button"
                        onClick={
                          handleSendToApprovals
                        }
                        disabled={
                          isProcessing ||
                          submissionLockRef.current
                        }
                        className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                      >

                        <span>
                          Submit for Approval
                        </span>

                        <ArrowRight className="w-4 h-4" />

                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setShowWorkflowPlan(
                            false
                          )
                        }
                        className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        Back to Combined Workflow
                      </button>
                    )
                  )}

                </div>

              </div>

            </div>

          </div>
        )}

      {showNoAssignmentFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">
                No Existing Assignment Found
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              MUAWIN could not find a matching PDF, DOCX, or TXT assignment document
              in this course's saved folder. You can create a new assignment instead.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNoAssignmentFileModal(false);
                  setPendingFileAssignment(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewAssignmentInstead}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"
              >
                Create Assignment
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};






