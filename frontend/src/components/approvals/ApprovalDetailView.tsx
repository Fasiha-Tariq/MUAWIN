import React, { useState } from 'react';
import { WorkflowItem } from '../../types';
import { 
  CheckCircle2, 
  XCircle, 
  Play, 
  Edit3, 
  FileText, 
  Calendar, 
  Sparkles, 
  MessageSquare, 
  Cpu, 
  ShieldAlert,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../common/StatusBadge';

interface ApprovalDetailViewProps {
  workflow: WorkflowItem;
  onApproveAndExecute: (workflowId: string) => void;
  onReject: (workflowId: string, reason?: string) => void;
}

export const ApprovalDetailView: React.FC<ApprovalDetailViewProps> = ({
  workflow,
  onApproveAndExecute,
  onReject
}) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [rejectPromptOpen, setRejectPromptOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Editable fields
  const [title, setTitle] = useState(workflow.payload?.title || workflow.title);
  const [description, setDescription] = useState(workflow.payload?.description || '');
  const [questions, setQuestions] = useState<string[]>(
    workflow.payload?.questions || [
      'Define usability according to standard criteria.',
      'Explain the major usability principles.',
      'Compare two usability evaluation methods.'
    ]
  );
  const [dueDate, setDueDate] = useState(workflow.payload?.dueDate || '25 September 2026, 11:59 PM');

  const handleSaveEdits = () => {
    if (workflow.payload) {
      workflow.payload.title = title;
      workflow.payload.description = description;
      workflow.payload.questions = questions;
      workflow.payload.dueDate = dueDate;
      workflow.title = title;
    }
    setIsEditing(false);
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, 'New question prompt...']);
  };

  const handleUpdateQuestion = (index: number, val: string) => {
    const updated = [...questions];
    updated[index] = val;
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/approvals')}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Pending Approvals</span>
        </button>

        <StatusBadge status={workflow.status} />
      </div>

      {/* 1. Request Stage */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
            <MessageSquare className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            1. Teacher Request
          </h3>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Original Instruction
          </p>
          <blockquote className="text-sm font-medium text-slate-900 italic">
            "{workflow.instructionText || `Create an assignment from today's ${workflow.courseCode} lecture.`}"
          </blockquote>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
            <span>Requested by: <strong>{workflow.requestedBy}</strong></span>
            <span>•</span>
            <span>Recorded at: <strong>{workflow.createdAt}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. MUAWIN Interpretation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
            <Cpu className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            2. MUAWIN Interpretation & Agentic Plan
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Intent</span>
            <span className="font-bold text-slate-900 mt-1 block">{workflow.actionType}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Course</span>
            <span className="font-bold text-slate-900 mt-1 block">{workflow.courseCode}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Source</span>
            <span className="font-medium text-slate-700 mt-1 block truncate">{workflow.source}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Action</span>
            <span className="font-medium text-slate-700 mt-1 block">Publish to Moellim Course Page</span>
          </div>
        </div>
      </div>

      {/* 3. Proposed Content (Assignment / Activity Preview) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              3. Proposed Content for Riphah Moellim
            </h3>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Proposal</span>
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Assignment Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Description / Instructions</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Due Date</label>
              <input
                type="text"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-slate-700">Assessment Questions</label>
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  + Add Question
                </button>
              </div>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-4">{i + 1}.</span>
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => handleUpdateQuestion(i, e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(i)}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs text-slate-600 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdits}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg"
              >
                Save Edits
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Assignment Title
              </span>
              <p className="text-sm font-bold text-slate-900 mt-1">{title}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Description
              </span>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                {description || "Answer the following questions based on the concepts discussed in Lecture 08."}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Questions ({questions.length})
              </span>
              <ol className="space-y-2 bg-slate-50 p-3.5 rounded-lg border border-slate-100 list-decimal list-inside text-slate-800">
                {questions.map((q, i) => (
                  <li key={i} className="leading-relaxed font-medium">
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center gap-6 pt-2 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Due Date: <strong>{dueDate}</strong></span>
              </span>
              <span>Total Marks: <strong>{workflow.payload?.totalMarks || 20}</strong></span>
              <span>Submission: <strong>{workflow.payload?.submissionType || 'PDF Upload'}</strong></span>
            </div>
          </div>
        )}

        {/* Human in the loop confirmation notice */}
        <div className="flex items-center gap-2.5 text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            By approving, MUAWIN will open an automated browser session to create this assignment on Moellim and verify its live availability.
          </span>
        </div>

        {/* Reject Dialog if open */}
        {rejectPromptOpen && (
          <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-2 text-xs">
            <h5 className="font-bold text-rose-900">Reason for Rejecting Workflow</h5>
            <input
              type="text"
              placeholder="e.g., Postponed to next week, or changed assignment scope..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg focus:outline-rose-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRejectPromptOpen(false)}
                className="px-3 py-1.5 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onReject(workflow.id, rejectReason);
                  navigate('/approvals');
                }}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3">
          <button
            onClick={() => setRejectPromptOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Reject</span>
          </button>

          <button
            onClick={() => setIsEditing(!isEditing)}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-4 h-4" />
            <span>{isEditing ? 'Close Editor' : 'Edit'}</span>
          </button>

          <button
            onClick={() => onApproveAndExecute(workflow.id)}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Approve & Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
};
