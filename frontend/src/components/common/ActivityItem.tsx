import React from 'react';
import { ActivityLog } from '../../types';
import { CheckCircle2, ShieldCheck, AlertCircle, Clock } from 'lucide-react';

export interface ActivityItemProps {
  log: ActivityLog;
  compact?: boolean;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({ log, compact = false }) => {
  const isVerified = log.status === 'Verified';
  const isFailed = log.status === 'Failed';

  return (
    <div className="relative group">
      {/* Node bullet */}
      <span
        className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-4 ring-white ${
          isVerified
            ? 'bg-emerald-500 text-white'
            : isFailed
            ? 'bg-rose-500 text-white'
            : 'bg-blue-500 text-white'
        }`}
      >
        {isVerified ? (
          <ShieldCheck className="w-2.5 h-2.5" />
        ) : isFailed ? (
          <AlertCircle className="w-2.5 h-2.5" />
        ) : (
          <CheckCircle2 className="w-2.5 h-2.5" />
        )}
      </span>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-900">{log.action}</span>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
              {log.courseCode}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 shrink-0">{log.timestamp}</span>
        </div>
        <p className="text-xs text-slate-600 mt-1 line-clamp-1">{log.details}</p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
          <span>{log.operator}</span>
          {log.moellimRef && (
            <>
              <span>•</span>
              <span className="font-mono text-[10px] text-slate-500">{log.moellimRef}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
