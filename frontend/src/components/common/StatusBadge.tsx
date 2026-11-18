import React from 'react';
import { CheckCircle2, Clock, ShieldCheck, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { WorkflowStatus } from '../../types';

interface StatusBadgeProps {
  status: WorkflowStatus | 'Completed' | 'Verified' | 'Pending' | 'Failed' | 'In Progress';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', className = '' }) => {
  const norm = status.toLowerCase();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-medium gap-1',
    md: 'px-2.5 py-1 text-xs font-medium gap-1.5',
    lg: 'px-3 py-1.5 text-sm font-medium gap-2'
  }[size];

  if (norm.includes('verified')) {
    return (
      <span className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 ${sizeClasses} ${className}`}>
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Verified</span>
      </span>
    );
  }

  if (norm.includes('completed')) {
    return (
      <span className={`inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 ${sizeClasses} ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>Completed</span>
      </span>
    );
  }

  if (norm.includes('waiting') || norm.includes('approval') || norm.includes('pending')) {
    return (
      <span className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 ${sizeClasses} ${className}`}>
        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>Waiting for Approval</span>
      </span>
    );
  }

  if (norm.includes('executing') || norm.includes('progress') || norm.includes('understanding')) {
    return (
      <span className={`inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 ${sizeClasses} ${className}`}>
        <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
        <span>In Progress</span>
      </span>
    );
  }

  if (norm.includes('approved')) {
    return (
      <span className={`inline-flex items-center rounded-full bg-teal-50 text-teal-700 border border-teal-200/80 ${sizeClasses} ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
        <span>Approved</span>
      </span>
    );
  }

  if (norm.includes('failed') || norm.includes('rejected')) {
    return (
      <span className={`inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 ${sizeClasses} ${className}`}>
        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>{norm.includes('rejected') ? 'Rejected' : 'Failed'}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full bg-slate-100 text-slate-700 border border-slate-200 ${sizeClasses} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
      <span className="capitalize">{status}</span>
    </span>
  );
};
