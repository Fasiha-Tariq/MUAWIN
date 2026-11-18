import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ActivityLog } from '../../types';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { ActivityItem } from '../common/ActivityItem';

interface RecentActivityListProps {
  logs: ActivityLog[];
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({ logs }) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">Recent Activity Timeline</h3>
          <button
            onClick={() => navigate('/logs')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 transition-colors"
          >
            <span>Full audit log</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {logs.slice(0, 5).map((log) => (
            <ActivityItem key={log.id} log={log} />
          ))}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="text-emerald-700 font-medium flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>All executed tasks verified on Moellim</span>
        </span>
        <button
          onClick={() => navigate('/logs')}
          className="text-slate-500 hover:text-slate-800 underline"
        >
          Export Logs
        </button>
      </div>
    </div>
  );
};

