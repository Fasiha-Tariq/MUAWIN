import React, { useState } from 'react';
import { LectureSessionData } from '../../types';
import { 
  ShieldCheck, 
  CheckSquare, 
  Square, 
  Edit3, 
  FileText, 
  Tag, 
  ListChecks, 
  AlertTriangle,
  X,
  Sparkles
} from 'lucide-react';

interface LectureSummaryModalProps {
  session: LectureSessionData;
  isOpen: boolean;
  onClose: () => void;
  onVerifyAndSave: (updatedSession: LectureSessionData, createWorkflows: boolean) => void;
}

export const LectureSummaryModal: React.FC<LectureSummaryModalProps> = ({
  session,
  isOpen,
  onClose,
  onVerifyAndSave
}) => {
  const [verifyTopics, setVerifyTopics] = useState(true);
  const [verifyKeyPoints, setVerifyKeyPoints] = useState(true);
  const [verifyDetectedTasks, setVerifyDetectedTasks] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTopic, setEditedTopic] = useState(session.topic);

  if (!isOpen) return null;

  const durationMin = Math.max(1, Math.round((session.durationSeconds || 1458) / 60));

  const handleSave = () => {
    const updated: LectureSessionData = {
      ...session,
      topic: editedTopic
    };
    onVerifyAndSave(updated, verifyDetectedTasks);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Teacher Verification & Lecture Summary
              </h3>
              <p className="text-xs text-slate-500">
                Review and authorize extracted academic insights before saving
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Lecture Metrics Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Course</span>
              <span className="font-bold text-slate-900 mt-1 block truncate">{session.courseName.split(' — ')[0]}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Duration</span>
              <span className="font-bold text-slate-900 mt-1 block">{durationMin} Minutes</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Topics Identified</span>
              <span className="font-bold text-blue-600 mt-1 block">{session.extractedTopics.length}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Potential Tasks</span>
              <span className="font-bold text-amber-600 mt-1 block">{session.detectedActions.length}</span>
            </div>
          </div>

          {/* Teacher Verification Checklist */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Teacher Verification Checklist</span>
              </h4>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                Teacher Review
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              MUAWIN strictly adheres to university governance: extracted tasks are never committed without explicit teacher confirmation.
            </p>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifyTopics}
                  onChange={(e) => setVerifyTopics(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="font-semibold text-slate-800">
                  Verify Extracted Topics ({session.extractedTopics.length} conceptual areas)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifyKeyPoints}
                  onChange={(e) => setVerifyKeyPoints(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="font-semibold text-slate-800">
                  Verify Key Takeaways & Class Notes ({session.keyPoints.length} points)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifyDetectedTasks}
                  onChange={(e) => setVerifyDetectedTasks(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="font-semibold text-slate-800">
                  Queue Detected Tasks ({session.detectedActions.length}) for Moellim Workflow Approval
                </span>
              </label>
            </div>
          </div>

          {/* Details Breakdown */}
          <div className="space-y-3">
            <div>
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block mb-1.5">
                Core Topics Identified
              </span>
              <div className="flex flex-wrap gap-1.5">
                {session.extractedTopics.map((t, i) => (
                  <span key={i} className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block mb-1.5">
                Detected Academic Tasks
              </span>
              {session.detectedActions.map((task) => (
                <div key={task.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1 mt-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{task.type}: {task.topic}</span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Due: {task.dueDateCandidate || 'TBD'}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{task.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={!verifyTopics || !verifyKeyPoints}
            className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Verify & Save Lecture</span>
          </button>
        </div>
      </div>
    </div>
  );
};
