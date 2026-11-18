import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Play
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ClassModeStatusCard: React.FC = () => {
  const navigate = useNavigate();
  const { 
    activeScheduleClass, 
    classModeStatus, 
    simulatedTimeString,
    stopClassModeManual,
    resumeClassModeManual,
    manualOverrideStopped,
    elapsedLectureSeconds,
    activeClassContent
  } = useApp();

  const [showStopModal, setShowStopModal] = useState<boolean>(false);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConfirmStop = () => {
    stopClassModeManual();
    setShowStopModal(false);
  };

  return (
    <>
      {/* Primary Upcoming / Active Class Mode Card */}
      <div className={`rounded-2xl p-4 sm:p-6 transition-all border shadow-sm relative overflow-hidden ${
        classModeStatus === 'live'
          ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-indigo-950 text-white border-rose-600/60 ring-2 ring-rose-500/20'
          : classModeStatus === 'upcoming_warning'
          ? 'bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 text-white border-amber-500/60 ring-2 ring-amber-500/20'
          : classModeStatus === 'ended'
          ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border-slate-700'
          : 'bg-white text-slate-900 border-slate-200'
      }`}>
        {/* Glow effect */}
        <div className={`absolute -right-10 -bottom-10 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-20 ${
          classModeStatus === 'live' ? 'bg-rose-500' : 'bg-amber-500'
        }`} />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-5 min-w-0">
          <div className="space-y-2 min-w-0 flex-1">
            {/* Header Tag / Operating Mode State */}
            <div className="flex items-center gap-2 flex-wrap">
              {classModeStatus === 'live' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>CLASS MODE — LIVE</span>
                </span>
              ) : classModeStatus === 'upcoming_warning' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>UPCOMING CLASS</span>
                </span>
              ) : classModeStatus === 'ended' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>CLASS SESSION ENDED</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>NEXT SCHEDULED CLASS</span>
                </span>
              )}

              <span className={`text-xs font-semibold ${classModeStatus === 'idle' ? 'text-slate-500' : 'text-slate-300'}`}>
                {activeScheduleClass.room}
              </span>
            </div>

            {/* Course Title & Section */}
            <div className="min-w-0">
              <h3 className="text-lg sm:text-2xl font-black tracking-tight break-words">
                {activeScheduleClass.courseCode} — {activeScheduleClass.courseTitle}
              </h3>
              <p className={`text-xs font-semibold mt-0.5 break-words ${classModeStatus === 'idle' ? 'text-slate-600' : 'text-slate-300'}`}>
                Section: <span className="font-bold text-amber-300">{activeScheduleClass.section}</span> • Lecture {activeScheduleClass.lectureNumber}: <em>{activeScheduleClass.topic}</em>
              </p>
            </div>

            {/* Timing & Auto-Start Indicators */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs pt-1">
              <div className="flex items-center gap-1.5 font-mono font-bold">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>{activeScheduleClass.startTime} – {activeScheduleClass.endTime}</span>
              </div>

              {classModeStatus === 'live' ? (
                <div className="flex items-center gap-1.5 text-rose-300 font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span>● Listening</span>
                  <span className="font-mono text-white bg-black/40 px-2 py-0.5 rounded border border-white/10 ml-1">
                    {formatTimer(elapsedLectureSeconds || 148)}
                  </span>
                </div>
              ) : classModeStatus === 'upcoming_warning' ? (
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>● Auto-start enabled</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    Starts in 5 minutes
                  </span>
                </div>
              ) : classModeStatus === 'ended' ? (
                <div className="flex items-center gap-1.5 text-purple-300 font-medium">
                  <span>Concluded at {activeScheduleClass.endTime} • {activeClassContent.detectedActions.length} academic directives ready for approval</span>
                </div>
              ) : (
                <span className="text-slate-500 font-medium">
                  Auto-starts automatically according to your timetable
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 pt-2 sm:pt-0">
            {classModeStatus === 'live' ? (
              <>
                <button
                  onClick={() => navigate('/lecture')}
                  className="px-4 py-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-white animate-pulse" />
                  <span>View Live Session</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setShowStopModal(true)}
                  className="px-3.5 py-2.5 text-xs font-bold bg-white/10 hover:bg-rose-900/60 text-rose-200 border border-rose-500/30 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                  <span>Stop Class Mode</span>
                </button>
              </>
            ) : classModeStatus === 'upcoming_warning' ? (
              <>
                <button
                  onClick={() => navigate('/lecture')}
                  className="px-5 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Radio className="w-4 h-4 text-slate-950" />
                  <span>Open Class Mode</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            ) : classModeStatus === 'ended' ? (
              <>
                <button
                  onClick={() => navigate('/lecture')}
                  className="px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>Review Extracted Tasks</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {manualOverrideStopped && (
                  <button
                    onClick={resumeClassModeManual}
                    className="px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-slate-300 rounded-xl transition-colors"
                  >
                    Resume Capture
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => navigate('/lecture')}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>View Timetable Session</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

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
                  Stop Class Mode?
                </h4>
                <p className="text-xs text-slate-500">
                  Override active timetable lecture capture
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Are you sure you want to stop Class Mode? This will conclude real-time transcription early for <strong>{activeScheduleClass.courseCode} ({activeScheduleClass.section})</strong> and synthesize the lecture summary.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowStopModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Continue
              </button>
              <button
                onClick={handleConfirmStop}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
