import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ArrowRight,
  Square,
  Mic2,
  CheckCircle2,
  Volume2,
  Check,
  Calendar,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DetectedAction } from '../types';

export const LectureSession: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    teacherSchedule,
    activeScheduleClass,
    selectScheduleClass,
    simulatedTimeString,
    jumpSimulatedPreset,
    classModeStatus,
    manualOverrideStopped,
    stopClassModeManual,
    resumeClassModeManual,
    activeClassContent,
    stageClassModeAction,
    elapsedLectureSeconds,
    workflows,
  } = useApp();

  const [showStopModal, setShowStopModal] = useState(false);
  const [stagedActionIds, setStagedActionIds] = useState<string[]>([]);

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

  const isActionStaged = (action: DetectedAction) => {
    if (stagedActionIds.includes(action.id)) return true;
    return workflows.some((w) => w.title.includes(action.topic));
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-200">
      {/* Top Bar */}
      

      {/* Course & Schedule Selector */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">
              {activeScheduleClass.room} • {activeScheduleClass.dayOfWeek} •{' '}
              {activeScheduleClass.startTime} – {activeScheduleClass.endTime}
            </p>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              {activeScheduleClass.courseCode} — {activeScheduleClass.courseTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Section {activeScheduleClass.section} •{' '}
              {user?.name || 'Dr. Hajra Murtaza'} • Lecture{' '}
              {activeScheduleClass.lectureNumber}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {teacherSchedule.map((sched) => (
              <button
                key={sched.id}
                onClick={() => selectScheduleClass(sched.id)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  activeScheduleClass.id === sched.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {sched.courseCode} ({sched.section}) • {sched.startTime}
              </button>
            ))}
          </div>
        </div>

        {/* Minimal Status Strip */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Clock: <strong className="font-mono text-slate-800">{simulatedTimeString}</strong>
          </span>

          <span className="capitalize font-medium text-slate-700">
            Status: {classModeStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* STATE 1: UPCOMING WARNING */}
      {classModeStatus === 'upcoming_warning' && (
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-amber-700">
              Starts in 5 minutes ({activeScheduleClass.startTime})
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Class Mode will start automatically on schedule.
            </p>
          </div>

          <button
            onClick={() => jumpSimulatedPreset('class_start')}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors cursor-pointer shrink-0"
          >
            Simulate 10:00 AM Start
          </button>
        </div>
      )}

      {/* STATE 2: LIVE */}
      {classModeStatus === 'live' && (
        <div className="space-y-5">
          {/* Live Control Bar */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Live Session — {activeScheduleClass.topic}
                </h4>
                <p className="text-xs text-slate-500">
                  Listening • Duration{' '}
                  <span className="font-mono text-slate-800">
                    {formatTimer(elapsedLectureSeconds || 148)}
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowStopModal(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Square className="w-3 h-3 fill-rose-600" />
              <span>Stop Class Mode</span>
            </button>
          </div>

          {/* Two-Column Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Live Transcript */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-slate-400" />
                  <span>Live Transcript</span>
                </h4>
                <span className="text-[11px] text-emerald-700 font-medium">
                  Streaming
                </span>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {activeClassContent.transcripts.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 bg-slate-50 rounded-xl text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="font-semibold text-slate-800">
                        {t.speaker}
                      </span>
                      <span className="font-mono text-[11px]">{t.timestamp}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{t.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Extracted Insights & Actions */}
            <div className="space-y-5">
              {/* Key Points & Topics */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
                <h4 className="text-sm font-bold text-slate-900">
                  Lecture Summary
                </h4>

                <div className="flex flex-wrap gap-1.5">
                  {activeClassContent.extractedTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700"
                    >
                      {topic}
                    </span>
                  ))}
                </div>

                <ul className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  {activeClassContent.keyPoints.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detected Actions */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">
                  Detected Actions ({activeClassContent.detectedActions.length})
                </h4>

                <div className="space-y-3">
                  {activeClassContent.detectedActions.map((action) => {
                    const staged = isActionStaged(action);
                    return (
                      <div
                        key={action.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {action.topic}
                          </span>
                          <span className="text-[11px] text-slate-500 uppercase">
                            {action.type}
                          </span>
                        </div>

                        <p className="text-slate-600 leading-relaxed">
                          {action.description}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Due {action.dueDateCandidate}</span>
                          </span>

                          {staged ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <Check className="w-3.5 h-3.5" />
                              <span>Staged</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleStageAction(action)}
                              className="px-3 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                            >
                              Stage
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

      {/* STATE 3: ENDED */}
      {classModeStatus === 'ended' && (
        <div className="space-y-5">
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Session Ended
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {manualOverrideStopped
                  ? 'Stopped manually. Summary and actions are ready.'
                  : `Concluded at ${activeScheduleClass.endTime}.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/approvals')}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Review Approvals</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {manualOverrideStopped && (
                <button
                  onClick={resumeClassModeManual}
                  className="px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Resume
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Lecture Summary */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
              <h4 className="text-sm font-bold text-slate-900">
                Lecture Summary
              </h4>

              <div className="flex flex-wrap gap-1.5">
                {activeClassContent.extractedTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700"
                  >
                    {topic}
                  </span>
                ))}
              </div>

              <ul className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                {activeClassContent.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Detected Actions */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                Detected Actions
              </h4>

              <div className="space-y-3">
                {activeClassContent.detectedActions.map((action) => {
                  const staged = isActionStaged(action);
                  return (
                    <div
                      key={action.id}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {action.topic}
                        </span>
                        <span className="text-[11px] text-slate-500 uppercase">
                          {action.type}
                        </span>
                      </div>

                      <p className="text-slate-600">{action.description}</p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                        <span className="text-slate-500">
                          Due {action.dueDateCandidate}
                        </span>

                        {staged ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <Check className="w-3.5 h-3.5" />
                            <span>Staged</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleStageAction(action)}
                            className="px-3 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                          >
                            Stage
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
      )}

      {/* STATE 4: IDLE */}
      {classModeStatus === 'idle' && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3">
          <Clock className="w-5 h-5 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            No active class right now
          </p>
          <p className="text-xs text-slate-500">
            Next scheduled class: {activeScheduleClass.courseCode} at{' '}
            {activeScheduleClass.startTime}
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => jumpSimulatedPreset('warning_5min')}
              className="px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Test 09:55 AM Warning
            </button>

            <button
              onClick={() => jumpSimulatedPreset('class_start')}
              className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer"
            >
              Test 10:00 AM Start
            </button>
          </div>
        </div>
      )}

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
                {activeScheduleClass.courseCode}. Your captured notes and
                detected actions will be saved.
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
                Stop Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};