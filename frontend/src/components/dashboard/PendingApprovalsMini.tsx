import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkflowItem } from '../../types';
import { Clock, ArrowRight, CheckCircle, FileText, BellRing, Sparkles } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';

interface PendingApprovalsMiniProps {
  workflows: WorkflowItem[];
}

export const PendingApprovalsMini: React.FC<PendingApprovalsMiniProps> = ({ workflows }) => {
  const navigate = useNavigate();
  const pending = workflows.filter((w) => w.status === 'waiting_approval');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Pending Approvals</h3>
            {pending.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {pending.length}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/approvals')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 transition-colors"
          >
            <span>View all approvals</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {pending.length === 0 ? (
          <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <CheckCircle className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">You're all caught up!</p>
            <p className="text-[11px] text-slate-500 mt-0.5">No actions require teacher approval at this moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.slice(0, 3).map((item) => {
              const isAssignment = item.actionType === 'Create Assignment';
              const Icon = isAssignment ? FileText : BellRing;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isAssignment ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{item.actionType}</span>
                        <span className="text-[11px] font-semibold text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                          {item.courseCode}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span>Source: <strong className="font-medium text-slate-700">{item.source}</strong></span>
                        {item.payload?.dueDate && (
                          <span>Due: <strong className="font-medium text-slate-700">{item.payload.dueDate.split(',')[0]}</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate('/approvals')}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
                  >
                    Review
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Supervised agentic automation</span>
        </span>
        <span className="text-slate-400">Zero unsupervised commits</span>
      </div>
    </div>
  );
};
