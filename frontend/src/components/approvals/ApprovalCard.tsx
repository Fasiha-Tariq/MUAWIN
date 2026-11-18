import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkflowItem } from '../../types';
import { FileText, BellRing, Calendar, Clock, ArrowRight, UserCheck } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';

interface ApprovalCardProps {
  workflow: WorkflowItem;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ workflow }) => {
  const navigate = useNavigate();
  const isAssignment = workflow.actionType === 'Create Assignment';
  const Icon = isAssignment ? FileText : BellRing;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl ${isAssignment ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 tracking-tight">{workflow.actionType}</h4>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {workflow.courseCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{workflow.courseName}</p>
            </div>
          </div>
          <StatusBadge status={workflow.status} size="sm" />
        </div>

        <h5 className="text-xs font-bold text-slate-800 mt-4 line-clamp-1">{workflow.title}</h5>

        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Requested By</span>
            <span className="font-semibold text-slate-700 mt-0.5 block truncate">{workflow.requestedBy}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Prepared By</span>
            <span className="font-semibold text-blue-700 mt-0.5 block">MUAWIN Agent</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Source</span>
            <span className="font-medium text-slate-600 mt-0.5 block truncate">{workflow.source}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Due Date</span>
            <span className="font-medium text-slate-600 mt-0.5 block truncate">{workflow.payload?.dueDate?.split(',')[0] || 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">Created {workflow.createdAt}</span>
        <button
          onClick={() => navigate(`/approvals/${workflow.id}`)}
          className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
        >
          <span>Review Approval</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
