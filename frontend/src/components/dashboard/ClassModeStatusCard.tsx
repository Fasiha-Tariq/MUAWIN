import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ArrowRight,
  Square,
  Volume2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ClassModeStatusCard: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeScheduleClass,
    classModeStatus,
    stopClassModeManual,
    resumeClassModeManual,
    manualOverrideStopped,
    elapsedLectureSeconds,
    activeClassContent,
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
      <div className="bg-gradient-to-r from-blue-50/70 via-slate-50/60 to-white rounded-2xl p-4 sm:p-5 border border-blue-200/80 shadow-xs transition-all">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 min-w-0">
          {/* Left: Status, Course & Timing */}
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {classModeStatus === 'live' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>Live Session</span>
                </span>
              ) : classModeStatus === 'upcoming_warning' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-blue-100/80 text-blue-700 border border-blue-200">
                  <span>Starts in 5 min</span>
                </span>
              ) : classModeStatus === 'ended' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-blue-100/80 text-blue-700 border border-blue-200">
                  <span>Session Ended</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-blue-100/80 text-blue-700 border border-blue-200">
                  <span>Next Scheduled Class</span>
                </span>
              )}

              <span className="text-slate-400">•</span>
              <span className="text-slate-500 font-medium">{activeScheduleClass.room}</span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight break-words">
              {activeScheduleClass.courseCode} — {activeScheduleClass.courseTitle}
            </h3>

            <p className="text-xs text-slate-500 break-words">
              {activeScheduleClass.section} • Lecture{' '}
              {activeScheduleClass.lectureNumber}:{' '}
              <span className="text-slate-700 font-medium">{activeScheduleClass.topic}</span>
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
              <span className="inline-flex items-center gap-1.5 font-mono text-slate-700">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {activeScheduleClass.startTime} – {activeScheduleClass.endTime}
                </span>
              </span>

              {classModeStatus === 'live' && (
                <>
                  <span>•</span>
                  <span className="text-rose-700 font-semibold">
                    Listening ({formatTimer(elapsedLectureSeconds || 148)})
                  </span>
                </>
              )}

              {classModeStatus === 'upcoming_warning' && (
                <>
                  <span>•</span>
                  <span className="text-blue-700 font-semibold">
                    Auto-start enabled
                  </span>
                </>
              )}

              {classModeStatus === 'ended' && (
                <>
                  <span>•</span>
                  <span className="text-slate-600 font-medium">
                    {activeClassContent.detectedActions.length} actions ready for
                    approval
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {classModeStatus === 'live' ? (
              <>
                <button
                  onClick={() => navigate('/lecture')}
                  className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>View Live Session</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setShowStopModal(true)}
                  className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-rose-500 text-rose-500" />
                  <span>Stop</span>
                </button>
              </>
            ) : classModeStatus === 'upcoming_warning' ? (
              <button
                onClick={() => navigate('/lecture')}
                className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Open Class Mode</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : classModeStatus === 'ended' ? (
              <>
                <button
                  onClick={() => navigate('/lecture')}
                  className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Review Tasks</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {manualOverrideStopped && (
                  <button
                    onClick={resumeClassModeManual}
                    className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  >
                    Resume
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => navigate('/lecture')}
                className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Open Class Mode</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stop Confirmation Modal */}
      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Stop Class Mode?
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                This will end live transcription early for{' '}
                {activeScheduleClass.courseCode} ({activeScheduleClass.section})
                and save the lecture summary.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowStopModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStop}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer"
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