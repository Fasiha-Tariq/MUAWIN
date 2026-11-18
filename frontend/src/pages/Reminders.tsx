import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Clock3, RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { featureService, ReminderRecord } from '../services/featureService';

type ExtendedReminderRecord = ReminderRecord & {
  type?: string;
  category?: string;
  week_number?: number;
  week?: number;
  current_week?: number;
  lecture_uploaded?: boolean;
  has_lecture?: boolean;
};

export const Reminders: React.FC = () => {
  const { selectedCourse, addToast } = useApp();
  const course = selectedCourse?.title || selectedCourse?.code || '';
  const [items, setItems] = useState<ExtendedReminderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!course) return;
    setLoading(true);
    setError('');
    try {
      const r = await featureService.reminders(course);
      setItems((r.data.reminders || []) as ExtendedReminderRecord[]);
    } catch (e: any) {
      setError(e.message || 'Could not load reminders.');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!course) return;
    setLoading(true);
    setError('');
    try {
      await featureService.refreshWeekly(course);
      const r = await featureService.reminders(course);
      setItems((r.data.reminders || []) as ExtendedReminderRecord[]);
      addToast('success', 'Reminders refreshed', 'Weekly work and reminder inbox checked.');
    } catch (e: any) {
      setError(e.message || 'Could not refresh reminders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [course]);

  const act = async (id: number, action: string) => {
    try {
      const until =
        action === 'snooze'
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : undefined;
      await featureService.reminderAction(id, action, until);
      addToast('success', 'Reminder updated', `Reminder ${action}d.`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not update reminder.');
    }
  };

  // Show only weeks up through the current week that have no lectures uploaded yet
  const missingLectureItems = useMemo(() => {
    return items.filter(item => {
      // Exclude already completed/uploaded or dismissed reminders
      if (
        item.lecture_uploaded === true ||
        item.has_lecture === true ||
        !['active', 'snoozed'].includes(item.status)
      ) {
        return false;
      }

      // Keep only lecture-related reminders (exclude assignment-only/quiz-only reminders)
      const isLectureReminder =
        item.type === 'missing_lecture' ||
        item.category === 'lecture' ||
        /\blecture\b/i.test(`${item.title || ''} ${item.message || ''}`);

      if (!isLectureReminder) {
        return false;
      }

      // Check across the current week (week <= current_week)
      const weekNum = item.week_number ?? item.week;
      if (weekNum != null && item.current_week != null) {
        return Number(weekNum) <= Number(item.current_week);
      }

      return true;
    });
  }, [items]);

  const active = missingLectureItems.filter(x =>
    ['active', 'snoozed'].includes(x.status)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Follow-up
        </h2>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Weeks missing lectures (up to current week)</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{active.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500">All missing-lecture reminders</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{missingLectureItems.length}</p>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Weeks without uploaded lectures</h2>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {!missingLectureItems.length && !loading && (
          <div className="text-center py-12">
            <Bell className="mx-auto text-slate-300" size={32} />
            <p className="font-semibold text-slate-700 mt-3">
              All lectures up to the current week are uploaded
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Weeks up through the current week without any uploaded lectures appear here. Completed uploads close their matching reminders.
            </p>
          </div>
        )}

        {missingLectureItems.map(item => (
          <article
            key={item.id}
            className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Bell size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 items-center">
                <h3 className="font-semibold text-sm text-slate-900">{item.title}</h3>
                <span
                  className={`text-[10px] font-bold uppercase rounded-full px-2 py-1 ${
                    item.status === 'active'
                      ? 'bg-amber-50 text-amber-700'
                      : item.status === 'snoozed'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{item.message}</p>
              <p className="text-[11px] text-slate-400 mt-2">
                Created {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
            {['active', 'snoozed'].includes(item.status) && (
              <div className="flex gap-2">
                <button
                  title="Acknowledge"
                  onClick={() => act(item.id, 'acknowledge')}
                  className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <Check size={16} />
                </button>
                <button
                  title="Snooze 24 hours"
                  onClick={() => act(item.id, 'snooze')}
                  className="p-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <Clock3 size={16} />
                </button>
                <button
                  title="Dismiss"
                  onClick={() => act(item.id, 'dismiss')}
                  className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
};