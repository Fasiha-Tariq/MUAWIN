import React, { useState, useEffect } from 'react';
import { LectureSessionData } from '../../types';
import { Mic, MicOff, Pause, Play, Square, Radio, Volume2 } from 'lucide-react';

interface LectureActiveViewProps {
  session: LectureSessionData;
  isPaused: boolean;
  onTogglePause: () => void;
  onEndLecture: () => void;
  onNewChunkGenerated?: (text: string) => void;
}

export const LectureActiveView: React.FC<LectureActiveViewProps> = ({
  session,
  isPaused,
  onTogglePause,
  onEndLecture,
  onNewChunkGenerated
}) => {
  const [seconds, setSeconds] = useState(session.durationSeconds || 1458);

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused]);

  // Format seconds into HH:MM:SS
  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
      {/* Session Top Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {!isPaused ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>
                <span>LIVE</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>PAUSED</span>
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">{session.courseName}</h3>
              <p className="text-xs text-slate-500 font-medium">Lecture 0{session.lectureNumber} • {session.section}</p>
            </div>
          </div>
        </div>

        {/* Timer & Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 font-mono text-sm font-bold text-slate-800">
            <Radio className="w-4 h-4 text-blue-600 animate-pulse" />
            <span>{formatTime(seconds)}</span>
          </div>

          <button
            onClick={onTogglePause}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
              isPaused
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            onClick={onEndLecture}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>End Lecture</span>
          </button>
        </div>
      </div>

      {/* Audio Waveform & Microphone Visualizer */}
      <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${!isPaused ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold block">{!isPaused ? 'Microphone Active' : 'Microphone Paused'}</span>
            <span className="text-[11px] text-slate-400 block">Streaming to MUAWIN academic speech parser</span>
          </div>
        </div>

        {/* Dynamic Simulated Audio Waveform */}
        <div className="flex items-center gap-1 h-6 shrink-0">
          {[12, 24, 16, 28, 14, 20, 26, 18, 22, 10, 24, 14].map((h, i) => (
            <span
              key={i}
              className={`w-1 rounded-full transition-all duration-300 ${!isPaused ? 'bg-blue-400' : 'bg-slate-600'}`}
              style={{
                height: !isPaused ? `${Math.max(6, (h * (i % 2 === 0 ? 1.2 : 0.8)))}px` : '4px'
              }}
            />
          ))}
        </div>
      </div>

      {/* Live Transcript Stream */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-blue-600" />
            <span>Live Lecture Transcript</span>
          </h4>
          <span className="text-[11px] text-slate-400">Continuous speech-to-text</span>
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3.5 max-h-80 overflow-y-auto">
          {session.transcriptChunks.map((chunk) => (
            <div key={chunk.id} className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{chunk.speaker}</span>
                <span className="text-[10px] font-mono text-slate-400">{chunk.timestamp}</span>
              </div>
              <p className="text-slate-700 leading-relaxed pl-2 border-l-2 border-blue-200">
                {chunk.text}
              </p>
            </div>
          ))}

          {!isPaused && (
            <div className="flex items-center gap-2 text-xs text-blue-600 italic py-1 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Listening for instructor speech & potential academic directives...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
