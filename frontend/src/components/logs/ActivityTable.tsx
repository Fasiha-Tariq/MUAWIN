import React, { useState } from 'react';
import { ActivityLog } from '../../types';
import { 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  ShieldCheck, 
  Clock, 
  Info,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';

interface ActivityTableProps {
  logs: ActivityLog[];
}

export const ActivityTable: React.FC<ActivityTableProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // Distinct courses for filter dropdown
  const uniqueCourses = Array.from(new Set(logs.map((l) => l.courseCode)));

  const filtered = logs.filter((log) => {
    const matchesSearch =
      log.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.courseTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCourse = courseFilter === 'ALL' || log.courseCode === courseFilter;
    const matchesStatus = statusFilter === 'ALL' || log.status.toUpperCase() === statusFilter.toUpperCase();

    return matchesSearch && matchesCourse && matchesStatus;
  });

  const exportCSV = () => {
    const headers = ['ID', 'Date & Time', 'Course', 'Action', 'Workflow', 'Status', 'Operator', 'Details', 'Moellim Ref'];
    const rows = filtered.map(l => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.courseCode} - ${l.courseTitle}"`,
      `"${l.action}"`,
      `"${l.workflowName}"`,
      l.status,
      `"${l.operator}"`,
      `"${l.details}"`,
      l.moellimRef || ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MUAWIN_activity_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search activity logs by action, course, or keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Course filter */}
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-blue-600 shrink-0"
          >
            <option value="ALL">All Courses</option>
            {uniqueCourses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-blue-600 shrink-0"
          >
            <option value="ALL">All Statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Export button */}
          <button
            onClick={exportCSV}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
            title="Download CSV Audit Log"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Course</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Workflow</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-600">No activity logs found</p>
                    <p className="text-[11px] mt-1">Try resetting your filters or search query.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{log.courseCode}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{log.courseTitle}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-[180px] truncate">
                      {log.workflowName}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={log.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 p-1"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Showing {filtered.length} of {logs.length} logged actions</span>
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Immutable audit trail</span>
          </span>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Moellim Audit Record
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{selectedLog.action}</h3>
              </div>
              <StatusBadge status={selectedLog.status} />
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Timestamp</span>
                <p className="text-slate-800 font-medium mt-0.5">{selectedLog.timestamp}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Target Course</span>
                  <p className="text-slate-800 font-bold mt-0.5">{selectedLog.courseCode}</p>
                  <p className="text-slate-500 text-[11px]">{selectedLog.courseTitle}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Operator</span>
                  <p className="text-slate-800 font-medium mt-0.5">{selectedLog.operator}</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Workflow Name</span>
                <p className="text-slate-800 font-medium mt-0.5">{selectedLog.workflowName}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Execution Details</span>
                <p className="text-slate-800 mt-1 leading-relaxed">{selectedLog.details}</p>
              </div>

              {selectedLog.moellimRef && (
                <div className="flex items-center justify-between p-2.5 bg-blue-50/80 rounded-xl border border-blue-200">
                  <span className="text-[11px] font-semibold text-blue-900">Moellim Confirmation ID:</span>
                  <span className="font-mono text-xs font-bold text-blue-700">{selectedLog.moellimRef}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
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
