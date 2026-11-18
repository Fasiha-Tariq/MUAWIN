import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Radio, 
  Clock, 
  Calendar, 
  AlertCircle, 
  ArrowRight, 
  Square, 
  Mic2, 
  Sparkles, 
  CheckCircle2, 
  Volume2,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  ShieldCheck,
  Layers,
  FileText,
  HelpCircle,
  ChevronRight,
  BookOpen,
  Info,
  FastForward,
  UserCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DetectedAction } from '../types';
export const LectureSession: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    user,
    courses,
    teacherSchedule,
    activeScheduleClass,
    selectScheduleClass,
    simulatedMinutes,
    simulatedTimeString,
    setSimulatedMinutes,
    jumpSimulatedPreset,
    classModeStatus,
    manualOverrideStopped,
    stopClassModeManual,
    resumeClassModeManual,
    activeClassContent,
    stageClassModeAction,
    elapsedLectureSeconds,
    workflows,
    addToast
  } = useApp();

  const [showStopModal, setShowStopModal] = useState<boolean>(false);
  const [stagedActionIds, setStagedActionIds] = useState<string[]>([]);

  // Format seconds to mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConfirmStop = () => {
    stopClassModeManual();
    setShowStopModal(false);
  };

  const handleStageAction = (action: DetectedAction) => {
    stageClassModeAction(action);
    setStagedActionIds((prev) => [...prev, action.id]);
  };

  // Check if action is already in workflows
  const isActionStaged = (action: DetectedAction) => {
    if (stagedActionIds.includes(action.id)) return true;
    return workflows.some(w => w.title.includes(action.topic));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-200">
      {/* Mode Distinction Callout Banner */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 sm:p-5 border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
            <Radio className="w-5 h-5 text-purple-400" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/80">
                Operating Mode: Class Mode
              </span>
              <span className="text-xs text-slate-400">â€¢</span>
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Automatic Timetable Operation</span>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-1">
              Class Mode â€” Live Academic Lecture Session
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
              Class Mode automatically starts and stops based on your scheduled class timetable. It continuously transcribes classroom audio, understands academic topics, and detects assignments, quizzes, and deadlines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/assistant')}
            className="px-3.5 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center gap-1.5"
            title="Switch to direct voice/text command mode"
          >
            <Mic2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Switch to Command Mode</span>
          </button>
        </div>
      </div>

      {/* Course Timetable & Active Section Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                Assigned Timetable Slot
              </span>
              <span className="text-xs text-slate-400">â€¢</span>
              <span className="text-xs font-semibold text-slate-600">
                {activeScheduleClass.room}
              </span>
              <span className="text-xs text-slate-400">â€¢</span>
              <span className="text-xs font-semibold text-slate-600">
                {activeScheduleClass.dayOfWeek}
              </span>
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              {activeScheduleClass.courseCode} â€” {activeScheduleClass.courseTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Section: <strong className="text-slate-800">{activeScheduleClass.section}</strong> â€¢ Instructor: <strong className="text-slate-800">{user?.name || 'Dr. Hajra Murtaza'}</strong> â€¢ Lecture {activeScheduleClass.lectureNumber}: <em>{activeScheduleClass.topic}</em>
            </p>
          </div>

          {/* Schedule Switcher for Dr. Hajra Murtaza's Assigned Classes */}
          <div className="shrink-0">
            <span className="text-[11px] text-slate-500 block mb-1.5 font-bold">
              Teacher Class Timetable:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {teacherSchedule.map((sched) => (
                <button
                  key={sched.id}
                  onClick={() => selectScheduleClass(sched.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                    activeScheduleClass.id === sched.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>{sched.courseCode} ({sched.section})</span>
                  <span className="text-[10px] opacity-75">{sched.startTime}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timetable Timing Bar */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Scheduled Class Time:</span>
              <strong className="text-slate-900 font-mono">{activeScheduleClass.startTime} â€“ {activeScheduleClass.endTime}</strong>
            </div>

            <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>â— Auto-start enabled</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-500">Simulated Clock:</span>
            <span className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
              {simulatedTimeString}
            </span>
            <span className="text-slate-400">â€¢</span>
            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
              classModeStatus === 'live'
                ? 'bg-rose-100 text-rose-800 animate-pulse'
                : classModeStatus === 'upcoming_warning'
                ? 'bg-amber-100 text-amber-800'
                : classModeStatus === 'ended'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-slate-200 text-slate-700'
            }`}>
              Status: {classModeStatus.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* STATE 1: UPCOMING WARNING (5 Minutes Before Scheduled Class) */}
      {classModeStatus === 'upcoming_warning' && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-2xl p-6 shadow-md border border-amber-400 animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-black/20 text-amber-100 font-black text-xs uppercase tracking-wider">
                  Upcoming Class Warning
                </span>
                <span className="text-xs font-bold text-amber-100">â€¢ Starts in 5 minutes</span>
              </div>
              <h3 className="text-2xl font-black tracking-tight">
                {activeScheduleClass.courseCode} â€” {activeScheduleClass.courseTitle} â€” {activeScheduleClass.section}
              </h3>
              <p className="text-xs sm:text-sm text-amber-100/90 font-medium">
                Your class starts in 5 minutes ({activeScheduleClass.startTime}). Class Mode will start automatically without requiring you to click Start Lecture.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => jumpSimulatedPreset('class_start')}
                className="px-4 py-2.5 text-xs font-black bg-slate-950 hover:bg-slate-900 text-white rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <FastForward className="w-4 h-4 text-amber-300" />
                <span>Simulate 10:00 AM (Auto-Start)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATE 2: CLASS MODE â€” LIVE (During Scheduled Class Timings) */}
      {classModeStatus === 'live' && (
        <div className="space-y-6">
          {/* Live Status Header Banner */}
          <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-6 shadow-md border-2 border-rose-600/80 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-80 h-full bg-white/5 skew-x-12 pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span>CLASS MODE â€” LIVE</span>
                  </span>
                  <span className="text-xs text-rose-200/80 font-semibold">â€¢ Continuous Audio Capture</span>
                </div>

                <h3 className="text-xl sm:text-3xl font-black text-white tracking-tight break-words">
                  Course: {activeScheduleClass.courseCode} â€” {activeScheduleClass.courseTitle}
                </h3>

                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-rose-100 font-semibold pt-1">
                  <span>Section: <strong className="text-amber-300">{activeScheduleClass.section}</strong></span>
                  <span>â€¢</span>
                  <span className="flex items-center gap-1">
                    Status: <strong className="text-rose-400">â— Listening</strong>
                  </span>
                  <span>â€¢</span>
                  <span>Started: <strong className="text-white">{activeScheduleClass.startTime}</strong></span>
                  <span>â€¢</span>
                  <span>Scheduled End: <strong className="text-white">{activeScheduleClass.endTime}</strong></span>
                </div>
              </div>

              {/* Right: Manual Stop Button (Override Only) */}
              <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0">
                <div className="text-right hidden sm:block">
                  <div className="text-[11px] text-rose-200 font-semibold">Active Session Duration</div>
                  <div className="font-mono text-xl font-black text-white">
                    {formatTimer(elapsedLectureSeconds || 148)}
                  </div>
                </div>

                <button
                  onClick={() => setShowStopModal(true)}
                  className="px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs font-bold bg-white/10 hover:bg-rose-900/80 text-rose-100 border border-rose-400/40 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                  title="Manual override to stop Class Mode before scheduled end"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                  <span>Stop Class Mode</span>
                </button>
              </div>
            </div>

            {/* Audio Waveform Visualizer (Desktop & Tablet only) */}
            <div className="mt-4 pt-3 border-t border-rose-900/60 hidden sm:flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-rose-200 font-mono">
                <Volume2 className="w-4 h-4 text-rose-400 animate-bounce" />
                <span>Classroom directional microphone array active (Noise SNR 24dB)</span>
              </div>

              <div className="h-8 flex items-center gap-1 overflow-hidden shrink-0">
                {[35, 60, 85, 45, 95, 70, 50, 80, 65, 90, 45, 75, 95, 40, 65, 80, 55, 90].map((height, i) => (
                  <span
                    key={i}
                    style={{ height: `${height}%` }}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      i % 2 === 0 ? 'bg-rose-500 animate-pulse' : 'bg-blue-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Continuous Speech-to-Text + Live Transcript + Lecture Understanding */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 6 Cols: Continuous Speech-to-Text & Live Transcript */}
            <div className="lg:col-span-6 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <Volume2 className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Live Transcript
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Continuous real-time speech-to-text recognition
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>Streaming</span>
                </span>
              </div>

              {/* Transcript feed */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {activeClassContent.transcripts.map((t) => (
                  <div 
                    key={t.id} 
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span>{t.speaker}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{t.timestamp}</span>
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed pl-3.5 border-l-2 border-blue-200">
                      {t.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 6 Cols: Lecture Understanding & Extracted Insights */}
            <div className="lg:col-span-6 space-y-6">
              {/* Lecture Understanding Card: Topics, Key Points, Important Concepts */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Lecture Understanding & Insights
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Semantic understanding extracted from classroom speech
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Real-Time Extraction
                  </span>
                </div>

                {/* Topics Covered */}
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Topics
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeClassContent.extractedTopics.map((topic, i) => (
                      <span 
                        key={i} 
                        className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                      >
                        â€¢ {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Key Points */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Key Points
                  </span>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {activeClassContent.keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Important Concepts */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Important Concepts
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeClassContent.importantConcepts.map((concept, i) => (
                      <span 
                        key={i} 
                        className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        â˜… {concept}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detected Academic Actions (Assignments, Quizzes, Deadlines) */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Detected Academic Actions
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Assignments, quizzes & deadlines identified from verbal instructions
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    {activeClassContent.detectedActions.length} Actions Found
                  </span>
                </div>

                <div className="space-y-3">
                  {activeClassContent.detectedActions.map((action) => {
                    const staged = isActionStaged(action);
                    return (
                      <div 
                        key={action.id}
                        className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                              {action.type}
                            </span>
                            <h5 className="text-sm font-bold text-slate-900 mt-1">
                              {action.topic}
                            </h5>
                          </div>

                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                            {Math.round(action.confidence * 100)}% Match
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {action.description}
                        </p>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-amber-200/60">
                          <span className="text-slate-600 font-semibold flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Due: <strong>{action.dueDateCandidate}</strong></span>
                          </span>

                          {staged ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Staged into Approvals</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleStageAction(action)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              <span>Stage Moellim Workflow</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE 3: CLASS MODE â€” ENDED (Auto-Stopped at Scheduled End Time OR Stopped Early) */}
      {classModeStatus === 'ended' && (
        <div className="space-y-6">
          {/* Class Session Ended Notification Banner */}
          <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border-2 border-purple-500/60">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>CLASS SESSION ENDED</span>
                  </span>
                  <span className="text-xs text-purple-200">
                    {manualOverrideStopped ? 'â€¢ Concluded by Teacher Override' : `â€¢ Concluded at scheduled time (${activeScheduleClass.endTime})`}
                  </span>
                </div>

                <h3 className="text-2xl font-black tracking-tight">
                  Your {activeScheduleClass.courseCode} â€” {activeScheduleClass.courseTitle} session has ended.
                </h3>
                <p className="text-xs sm:text-sm text-purple-100/90 font-medium">
                  Continuous speech transcription stopped automatically. All topics, key points, and academic commitments have been structured for your review.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate('/approvals')}
                  className="px-4 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Review Teacher Approvals</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {manualOverrideStopped && (
                  <button
                    onClick={resumeClassModeManual}
                    className="px-3.5 py-2.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                  >
                    Resume Session
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Post-Class Detailed Review & Synthesis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Comprehensive Lecture Summary */}
            <div className="lg:col-span-2 space-y-6">
              {/* Lecture Summary Box */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Lecture Summary & Syllabus Logbook</span>
                  </h4>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Archived & Synced
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">
                  Instructor <strong>{user?.name || 'Dr. Hajra Murtaza'}</strong> delivered Lecture {activeScheduleClass.lectureNumber} on <em>{activeScheduleClass.topic}</em> to <strong>{activeScheduleClass.section}</strong>. Complete lecture audio stream has been processed and aligned with Moellim syllabus standards.
                </p>

                {/* Topics Covered */}
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Topics Covered
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeClassContent.extractedTopics.map((topic, i) => (
                      <span 
                        key={i} 
                        className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                      >
                        âœ“ {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Key Takeaways & Directives */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Key Points & Directives
                  </span>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {activeClassContent.keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Important Concepts */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Important Concepts
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeClassContent.importantConcepts.map((concept, i) => (
                      <span 
                        key={i} 
                        className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        â˜… {concept}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Finalized Transcript Status */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-slate-500" />
                    <span>Transcript Status</span>
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">
                    {activeClassContent.transcripts.length} spoken segments logged
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 flex items-center justify-between">
                  <span>Audio capture finalized & speech-to-text processing complete.</span>
                  <span className="font-bold text-emerald-700">100% Parsed</span>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Detected Academic Actions Review */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Detected Academic Actions
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Teacher verification & approval
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Teacher Review
                  </span>
                </div>

                <div className="space-y-3">
                  {activeClassContent.detectedActions.map((action) => {
                    const staged = isActionStaged(action);
                    return (
                      <div 
                        key={action.id}
                        className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2.5"
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          {action.type}
                        </span>
                        <h5 className="text-sm font-bold text-slate-900">
                          {action.topic}
                        </h5>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {action.description}
                        </p>

                        <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs">
                          <span className="text-slate-500 text-[11px]">
                            Due: <strong>{action.dueDateCandidate}</strong>
                          </span>

                          {staged ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Staged</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleStageAction(action)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              <span>Stage for Approval</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <button
                    onClick={() => navigate('/approvals')}
                    className="w-full py-2.5 px-4 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Go to Teacher Approvals Queue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Processing Status Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                  Processing Status
                </span>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Ready for Teacher Review</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  No automated changes have been applied to Moellim yet. The teacher must review and authorize any proposed actions before Playwright executes them on the university LMS.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE 4: IDLE / STANDBY (No Active Class at this hour) */}
      {classModeStatus === 'idle' && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-bold text-slate-900">
              Timetable Standby Mode
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              No lecture is actively scheduled at this exact simulated time ({simulatedTimeString}). Next class for {activeScheduleClass.courseCode} is at <strong>{activeScheduleClass.startTime}</strong>.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => jumpSimulatedPreset('warning_5min')}
              className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <span>Test 5-Minute Warning (09:55 AM)</span>
            </button>

            <button
              onClick={() => jumpSimulatedPreset('class_start')}
              className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <span>Test Class Auto-Start (10:00 AM)</span>
            </button>
          </div>
        </div>
      )}

      {/* Manual Stop Confirmation Modal */}
      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <span className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </span>
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Are you sure you want to stop Class Mode?
                </h4>
                <p className="text-xs text-slate-500">
                  Manual teacher override for active timetable lecture
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Stopping Class Mode will conclude real-time transcription early for <strong>{activeScheduleClass.courseCode} ({activeScheduleClass.section})</strong> before the scheduled end time of {activeScheduleClass.endTime}. Extracted topics and proposed actions will be preserved for review.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowStopModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Continue
              </button>
              <button
                onClick={handleConfirmStop}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

