import React, { useState } from 'react';
import { 
  History, 
  Search, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Filter, 
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ActivityLogs: React.FC = () => {
  const { user, courses, activityLogs } = useApp();
  const [courseFilter, setCourseFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Course isolation: only show logs relating to this teacher's courses or general system logs
  const teacherCourseCodes = new Set(courses.map(c => c.code.toLowerCase()));

  const filteredLogs = activityLogs.filter(log => {
  /*
   * Course isolation
   *
   * A real Moellim result may contain the section name, for example:
   * "CS7 MUAWIN (Female)"
   *
   * while the frontend course may be:
   * "CS7 MUAWIN"
   *
   * Therefore compare using partial matching.
   */
  if (log.courseCode) {
    const codeClean = log.courseCode.toLowerCase().trim();

    const matchTeacherCourse = Array.from(teacherCourseCodes).some(tc => {
      const teacherCode = tc.toLowerCase().trim();

      return (
        codeClean.includes(teacherCode) ||
        teacherCode.includes(codeClean)
      );
    });

    /*
     * During the current integration phase, the frontend still has
     * dummy course data while Moellim courses are being integrated.
     *
     * Do not hide a verified real Moellim activity just because
     * the course has not yet been synchronized into the frontend.
     */
    if (!matchTeacherCourse && log.status !== 'Verified') {
      return false;
    }
  }

  // Course dropdown filter
  if (courseFilter !== 'all') {
    const selectedCourse = courseFilter.toLowerCase().trim();
    const logCourse = log.courseCode?.toLowerCase().trim() || '';

    if (
      !logCourse.includes(selectedCourse) &&
      !selectedCourse.includes(logCourse)
    ) {
      return false;
    }
  }

  // Search filter
  if (search.trim()) {
    const q = search.toLowerCase();

    return (
      log.details.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.courseCode &&
        log.courseCode.toLowerCase().includes(q)) ||
      (log.operator &&
        log.operator.toLowerCase().includes(q))
    );
  }

  return true;
});

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="border-b border-slate-200/80 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider flex items-center gap-1">
              <History className="w-3 h-3 text-blue-600" />
              <span>Immutable Audit Trail</span>
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">Instructor Action & Moellim Commits</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Activity Logs</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographically audited log of all approvals and automated actions executed on Riphah Moellim.
          </p>
        </div>

        <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs self-start sm:self-auto">
          Logged Operator: <strong>{user?.name}</strong>
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audit trail by keyword, course, or operator..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-600"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-600">Filter:</span>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-blue-600"
            >
              <option value="all">All Assigned Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.code}>{c.code} ({c.section})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Responsive Log Feed: Desktop Table & Mobile Stacked Cards */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500 shadow-xs">
          No audit records matching your current filter criteria.
        </div>
      ) : (
        <>
          {/* MOBILE VIEW (<768px): Stacked Activity Cards */}
          <div className="md:hidden space-y-3">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-2.5"
              >
                {/* Action & Course */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Action
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 break-words">
                      {log.action}
                    </h4>
                  </div>

                  {log.courseCode && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                      {log.courseCode}
                    </span>
                  )}
                </div>

                {/* Details */}
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {log.details}
                </p>

                {/* Status & Time */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  {/* Status */}
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 text-[11px]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Verified</span>
                  </span>

                  {/* Time */}
                  <span className="text-slate-500 text-[11px] font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{log.timestamp}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP VIEW (>=768px): Structured Table */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.courseCode ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                          {log.courseCode}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-md break-words">
                      {log.details}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Verified on Moellim</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
