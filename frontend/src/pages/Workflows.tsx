import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  ArrowRight,
  Eye,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WorkflowItem } from '../types';

export const Workflows: React.FC = () => {
  const navigate = useNavigate();
  const { courses, workflows } = useApp();

  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectWorkflow, setInspectWorkflow] = useState<WorkflowItem | null>(null);

  // Strictly filter workflows to this teacher's assigned courses
  const teacherCourseIds = new Set(courses.map((c) => c.id));

  const filteredWorkflows = workflows.filter((wf) => {
    if (!teacherCourseIds.has(wf.courseId)) return false;
    if (selectedCourseFilter !== 'all' && wf.courseId !== selectedCourseFilter) return false;
    if (selectedStatusFilter !== 'all' && wf.status !== selectedStatusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = wf.title.toLowerCase().includes(q);
      const matchCourse = wf.courseCode.toLowerCase().includes(q);
      const matchAction = wf.actionType.toLowerCase().includes(q);
      if (!matchTitle && !matchCourse && !matchAction) return false;
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Completed & Synced</span>
          </span>
        );
      case 'waiting_approval':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Waiting Approval</span>
          </span>
        );
      case 'executing':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 flex items-center gap-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>Executing on Moellim</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            <span>Rejected</span>
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-in fade-in duration-200">
      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows by title, course, or action type..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-600"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Section / Course Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Section:</span>
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-blue-600 max-w-[230px] cursor-pointer"
              >
                <option value="all">All My Courses ({courses.length})</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}{c.section ? ` (${c.section})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Status:</span>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-blue-600 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="waiting_approval">Waiting Approval</option>
                <option value="completed">Completed & Synced</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button below search bar */}
      <div className="flex justify-end">
        <button
          onClick={() => navigate('/assistant')}
          className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          + New Workflow Intent
        </button>
      </div>

      {/* Workflow Cards */}
      {filteredWorkflows.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700">No matching workflows found</p>
          <p className="text-xs text-slate-400">
            Try adjusting your search criteria or switch to another assigned course section.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWorkflows.map((wf) => (
            <div
              key={wf.id}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                    {wf.courseCode}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {wf.actionType}
                  </span>
                  {getStatusBadge(wf.status)}
                </div>

                <h4 className="text-sm font-bold text-slate-900">{wf.title}</h4>
                <p className="text-xs text-slate-500">
                  Requested by <strong>{wf.requestedBy}</strong> • {wf.createdAt}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => setInspectWorkflow(wf)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect Steps</span>
                </button>

                {wf.status === 'waiting_approval' && (
                  <button
                    onClick={() => navigate('/approvals')}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Authorize</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workflow Inspection Modal */}
      {inspectWorkflow && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                    {inspectWorkflow.courseCode}
                  </span>
                  {getStatusBadge(inspectWorkflow.status)}
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-1 break-words">{inspectWorkflow.title}</h4>
              </div>
              <button
                onClick={() => setInspectWorkflow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1 min-h-0">
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block mb-1">
                  Pipeline Steps & Moellim Automation Log
                </span>
                <div className="space-y-2">
                  {inspectWorkflow.steps.map((step, idx) => (
                    <div 
                      key={step.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 break-words">{step.title}</span>
                          <span className="text-[10px] font-semibold text-slate-400 shrink-0">{step.status}</span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5 break-words">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {inspectWorkflow.payload && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 min-w-0">
                  <span className="text-slate-400 uppercase font-bold text-[10px] block">
                    Recorded Parameters
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Target Section:</span>
                      <p className="font-bold text-slate-800 break-words">{inspectWorkflow.payload.targetSection || inspectWorkflow.courseCode}</p>
                    </div>
                    {inspectWorkflow.payload.dueDate && (
                      <div>
                        <span className="text-slate-400">Due Date:</span>
                        <p className="font-bold text-slate-800">{inspectWorkflow.payload.dueDate}</p>
                      </div>
                    )}
                    {inspectWorkflow.payload.totalMarks && (
                      <div>
                        <span className="text-slate-400">Total Marks:</span>
                        <p className="font-bold text-blue-700">{inspectWorkflow.payload.totalMarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setInspectWorkflow(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};