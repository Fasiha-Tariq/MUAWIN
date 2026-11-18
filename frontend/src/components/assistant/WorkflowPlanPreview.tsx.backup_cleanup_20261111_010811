import React, { useState } from 'react';
import { WorkflowItem, WorkflowStep } from '../../types';
import { 
  CheckCircle2, 
  ArrowDown, 
  Clock, 
  ShieldAlert, 
  Play, 
  XCircle, 
  Edit3, 
  FileText, 
  Calendar,
  Sparkles
} from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';

interface WorkflowPlanPreviewProps {
  workflow: WorkflowItem;
  onApproveAndExecute: (workflowId: string) => void;
  onReject: (workflowId: string) => void;
  onEdit?: (workflowId: string) => void;
}

export const WorkflowPlanPreview: React.FC<WorkflowPlanPreviewProps> = ({
  workflow,
  onApproveAndExecute,
  onReject,
  onEdit
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableTitle, setEditableTitle] = useState(workflow.title);
  const [editableDate, setEditableDate] = useState(workflow.payload?.dueDate || '25 September 2026, 11:59 PM');

  const handleSaveEdit = () => {
    setIsEditing(false);
    if (workflow.payload) {
      workflow.title = editableTitle;
      workflow.payload.dueDate = editableDate;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-white/10 text-white">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
              Workflow Planning Stage
            </span>
          </div>
          <StatusBadge status={workflow.status} />
        </div>
        <h3 className="text-lg font-extrabold tracking-tight mt-2">{workflow.title}</h3>
        <p className="text-xs text-blue-100/90 mt-1 max-w-2xl leading-relaxed">
          MUAWIN has converted your intent into a structured 5-step execution plan.
          Review the sequence and authorize execution below.
        </p>
      </div>

      {/* Structured Workflow Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Execution Steps Sequence
          </h4>
          <span className="text-xs text-slate-400 font-medium">5 sequential stages</span>
        </div>

        <div className="space-y-2.5">
          {workflow.steps.map((step, idx) => {
            const isLast = idx === workflow.steps.length - 1;
            const isApproval = step.title.toLowerCase().includes('approval');

            return (
              <React.Fragment key={step.id}>
                <div
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                    isApproval
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-white border-slate-200/90'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                      isApproval
                        ? 'bg-amber-500 text-white'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {step.id}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs font-bold text-slate-900 tracking-tight">{step.title}</h5>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isApproval
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isApproval ? 'Required Gate' : 'Automated'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.description}</p>
                  </div>
                </div>

                {!isLast && (
                  <div className="flex justify-center -my-1">
                    <ArrowDown className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Workflow Summary Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>Workflow Summary & Moellim Payload</span>
          </h4>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Payload</span>
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Title</label>
              <input
                type="text"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-blue-600"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Due Date</label>
              <input
                type="text"
                value={editableDate}
                onChange={(e) => setEditableDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-blue-600"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Action</span>
              <span className="font-bold text-slate-900 mt-1 block">{workflow.actionType}</span>
            </div>
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Course</span>
              <span className="font-bold text-slate-900 mt-1 block">{workflow.courseCode}</span>
            </div>
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Source</span>
              <span className="font-medium text-slate-700 mt-1 block truncate">{workflow.source}</span>
            </div>
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Date</span>
              <span className="font-medium text-slate-700 mt-1 block">{workflow.payload?.dueDate || 'Not Set'}</span>
            </div>
          </div>
        )}

        {/* Generated Questions / Details Preview */}
        {workflow.payload?.questions && (
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Generated Assignment Questions ({workflow.payload.questions.length})
            </span>
            <ul className="space-y-1.5 text-xs text-slate-700 list-decimal list-inside">
              {workflow.payload.questions.map((q: string, qIdx: number) => (
                <li key={qIdx} className="leading-relaxed">
                  <span className="font-medium">{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Human-in-the-loop Notice */}
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50/80 px-3 py-2.5 rounded-xl border border-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Human Approval Mandate:</strong> MUAWIN will not execute actions on Moellim without explicit teacher authorization.
          </span>
        </div>

        {/* Approval Action Buttons */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3 flex-wrap">
          <button
            onClick={() => onReject(workflow.id)}
            className="px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Reject Workflow</span>
          </button>

          <button
            onClick={() => onApproveAndExecute(workflow.id)}
            className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-colors flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Approve & Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
};
