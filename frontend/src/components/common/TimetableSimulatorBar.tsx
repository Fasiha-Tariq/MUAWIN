import React, { useState } from 'react';
import { Clock, Sliders, ChevronDown, ChevronUp, FastForward, Play, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { scheduleService } from '../../services/scheduleService';

export const TimetableSimulatorBar: React.FC = () => {
  const { 
    teacherSchedule,
    activeScheduleClass,
    selectScheduleClass,
    simulatedMinutes,
    simulatedTimeString,
    setSimulatedMinutes,
    jumpSimulatedPreset,
    classModeStatus,
    manualOverrideStopped
  } = useApp();

  const [expanded, setExpanded] = useState<boolean>(true);

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-white text-xs px-3 sm:px-4 py-2 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
        {/* Left: Indicator of current simulation time */}
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="p-1 rounded-md bg-blue-500/20 text-blue-400">
              <Clock className="w-3.5 h-3.5" />
            </span>
            <span className="font-semibold text-slate-300 text-[11px] sm:text-xs">Simulator:</span>
            <span className="font-mono font-bold text-amber-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-xs">
              {simulatedTimeString}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
              classModeStatus === 'live' 
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                : classModeStatus === 'upcoming_warning'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : classModeStatus === 'ended'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'bg-slate-700 text-slate-300'
            }`}>
              {classModeStatus === 'live' && '● LIVE'}
              {classModeStatus === 'upcoming_warning' && '⚠ UPCOMING (5 MIN)'}
              {classModeStatus === 'ended' && 'ENDED'}
              {classModeStatus === 'idle' && 'STANDBY'}
            </span>
            {manualOverrideStopped && (
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-700/60">
                (Manual Stop)
              </span>
            )}
          </div>
        </div>

        {/* Right: Quick jumps to test each phase with responsive labels */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400 hidden xl:inline">Test Flow:</span>

          <button
            onClick={() => jumpSimulatedPreset('warning_5min')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              classModeStatus === 'upcoming_warning' 
                ? 'bg-amber-500 text-slate-950 font-black' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
            title="Jump to 5 minutes before scheduled start"
          >
            <span className="sm:hidden">09:55 Warn</span>
            <span className="hidden sm:inline">09:55 AM (5-Min Warning)</span>
          </button>

          <button
            onClick={() => jumpSimulatedPreset('class_start')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              classModeStatus === 'live' && simulatedMinutes === activeScheduleClass.startMinutes
                ? 'bg-emerald-500 text-slate-950 font-black' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
            title="Jump to class start time (Auto-starts Class Mode)"
          >
            <span className="sm:hidden">10:00 Auto</span>
            <span className="hidden sm:inline">10:00 AM (Auto-Start)</span>
          </button>

          <button
            onClick={() => jumpSimulatedPreset('mid_lecture')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              classModeStatus === 'live' && simulatedMinutes > activeScheduleClass.startMinutes
                ? 'bg-rose-600 text-white font-black' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
            title="Jump to mid-lecture (Live Continuous Transcription)"
          >
            <span className="sm:hidden">10:35 Live</span>
            <span className="hidden sm:inline">10:35 AM (Mid-Lecture)</span>
          </button>

          <button
            onClick={() => jumpSimulatedPreset('class_end')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              classModeStatus === 'ended'
                ? 'bg-purple-600 text-white font-black' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
            title="Jump to 11:30 AM (Auto-stops Class Mode)"
          >
            <span className="sm:hidden">11:30 Stop</span>
            <span className="hidden sm:inline">11:30 AM (Auto-Stop)</span>
          </button>

          <button
            onClick={() => jumpSimulatedPreset('next_class')}
            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 transition-colors cursor-pointer"
            title="Switch to next scheduled course in Dr. Hajra Murtaza's timetable"
          >
            Next (PDC)
          </button>
        </div>
      </div>
    </div>
  );
};
