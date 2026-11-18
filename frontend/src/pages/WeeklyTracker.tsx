import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, RefreshCw, Plus, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { featureService, WeekExpectation } from '../services/featureService';

export const WeeklyTracker: React.FC = () => {
  const { courses, selectedCourse, selectCourse, addToast } = useApp();
  const course = selectedCourse?.title || selectedCourse?.code || '';
  const [weeks, setWeeks] = useState<WeekExpectation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!course) return;
    setLoading(true);
    setError('');
    try {
      const res = await featureService.weekly(course);
      setWeeks(res.data.weeks || []);
    } catch (e: any) {
      setError(e.message || 'Could not load weekly progress.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [course]);

  const refresh = async () => {
    if (!course) return;
    setLoading(true);
    setError('');
    try {
      const res = await featureService.refreshWeekly(course);
      setWeeks(res.data.weeks || []);
      addToast(
        'success',
        'Moellim verification complete',
        `${res.data.checked || 0} lecture record(s) checked; ${res.data.missing || 0} missing; ${res.data.unknown || 0} could not be verified.`
      );
    } catch (e: any) {
      setError(e.message || 'Live Moellim verification failed. Existing progress was preserved.');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      await featureService.saveWeekly(
        course,
        weeks.map(w => ({
          week: w.week,
          topic: w.topic,
          due_date: w.due_date,
          expected: w.expected !== false,
        }))
      );
      addToast('success', 'Weekly plan saved', 'Your corrected weekly expectations have been saved.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save weekly plan.');
    } finally {
      setLoading(false);
    }
  };

  const update = (i: number, key: string, value: any) =>
    setWeeks(old => old.map((w, j) => (j === i ? { ...w, [key]: value } : w)));

  const completed = weeks.filter(w => w.lecture_completed).length;
  const percent = weeks.length ? Math.round((completed / weeks.length) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Progress
          </h2>
        </div>

        {/* Mobile-only course selector (Topbar already provides this on tablet/desktop) */}
        <select
          value={selectedCourse?.id || ''}
          onChange={e => selectCourse(e.target.value)}
          className="sm:hidden rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          {courses.map(c => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">Lecture completion</p>
            <p className="text-xs text-slate-500 mt-1">
              {completed} of {weeks.length} expected weeks completed
            </p>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{percent}%</p>
        </div>
        <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900">Expected weekly content</h2>
            <p className="text-xs text-slate-500">Edit the topic or add a week, then save your corrections.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() =>
                setWeeks(old => [
                  ...old,
                  { week: Math.max(0, ...old.map(w => w.week)) + 1, topic: '', expected: true },
                ])
              }
              className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
            >
              <Plus size={16} /> Add week
            </button>
            <button
              onClick={refresh}
              disabled={loading || !course}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} /> {loading ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>

        {!weeks.length && !loading && (
          <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl">
            No weekly expectations found yet. Upload and confirm a timetable in Course Setup first.
          </p>
        )}

        <div className="space-y-2">
          {weeks.map((w, i) => (
            <div
              key={w.week}
              className="grid grid-cols-[auto_65px_1fr_auto] gap-3 items-center border border-slate-100 rounded-xl p-3"
            >
              <div className={w.lecture_completed ? 'text-emerald-600' : 'text-slate-300'}>
                {w.lecture_completed ? <CheckCircle2 /> : <Circle />}
              </div>
              <span className="text-sm font-bold text-slate-700">Week {w.week}</span>
              <div className="min-w-0">
                <input
                  value={w.topic || ''}
                  onChange={e => update(i, 'topic', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-blue-600"
                  placeholder="Expected topic"
                />
                <p className="text-[11px] mt-1 text-slate-500">
                  {w.lecture_completed
                    ? `Uploaded ${w.uploaded_at ? new Date(w.uploaded_at).toLocaleDateString() : ''}`
                    : 'No lecture upload recorded'}
                </p>
              </div>
              <span
                className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${
                  w.lecture_completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {w.lecture_completed ? 'Completed' : 'Pending'}
              </span>
            </div>
          ))}
        </div>

       
      </section>
    </div>
  );
};