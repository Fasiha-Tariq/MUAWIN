import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Clock, Radio, ArrowRight, X, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const UpcomingClassAlert: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    activeScheduleClass, 
    upcomingWarningActive, 
    dismissUpcomingWarning,
    classModeStatus 
  } = useApp();

  // Hidden for now
  return null;

  // If not in 5-minute warning window or already dismissed, do not render
  if (!upcomingWarningActive) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:w-[450px] max-w-[calc(100vw-1.5rem)] z-50 animate-in slide-in-from-bottom-4 sm:slide-in-from-top-4 duration-300">
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-2xl border-2 border-amber-500/80 backdrop-blur-md relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              <Bell className="w-4 sm:w-5 h-4 sm:h-5 text-amber-400 animate-bounce" />
            </span>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 block">
                Upcoming Class Alert
              </span>
              <h4 className="text-sm sm:text-base font-black text-white tracking-tight">
                Upcoming Class
              </h4>
            </div>
          </div>

          <button
            onClick={dismissUpcomingWarning}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Dismiss notification"
            aria-label="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5 relative z-10 min-w-0">
          <div className="text-xs sm:text-sm font-extrabold text-blue-200 break-words">
            {activeScheduleClass.courseCode} — {activeScheduleClass.courseTitle} — {activeScheduleClass.section}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your class starts in 5 minutes ({activeScheduleClass.startTime} – {activeScheduleClass.endTime}).
          </p>

          <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-300 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>Class Mode will start automatically.</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 relative z-10">
          <button
            onClick={dismissUpcomingWarning}
            className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Dismiss
          </button>

          <button
            onClick={() => {
              navigate('/lecture');
            }}
            className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer font-sans"
          >
            <span>View Class</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};