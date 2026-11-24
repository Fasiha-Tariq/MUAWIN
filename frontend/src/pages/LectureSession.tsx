import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AudioLines, BookOpen, CalendarClock, CircleAlert, Mic, NotebookPen, Square } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/common/Button';
import { PageHeader } from '../components/common/PageHeader';
import {
  classModeService, openClassMicrophone, ClassDetails, ClassMicrophoneInput, ClassMicrophoneStatus,
  ClassSession, ClassSuggestion, TranscriptSegment,
} from '../services/classModeService';

const panel = 'space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
const input = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50';
const displayTime = (time: string, timeZone?: string) =>
  new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const microphoneCopy = {
  idle: '',
  permission: 'Waiting for microphone permission…',
  connecting: 'Connecting to live transcription…',
  listening: 'Listening… Speak to see the transcript appear here.',
  reconnecting: 'Reconnecting to live transcription…',
  stopping: 'Finishing the transcript…',
};

export function LectureSession() {
  const { courses, selectedCourse, selectCourse, liveClassStatus, liveClassError } = useApp();
  const courseId = selectedCourse?.id || courses[0]?.id;
  const [latest, setSession] = useState<ClassSession | null>(null);
  const [history, setHistory] = useState<ClassSession[]>([]);
  const [olderSessionId, setOlderSessionId] = useState('');
  const [active, setActive] = useState<ClassSession | null>(null);
  const [upcoming, setUpcoming] = useState<string | null>(null);
  const [details, setDetails] = useState<ClassDetails | null>(null);
  const [interim, setInterim] = useState('');
  const [microphone, setMicrophone] = useState<ClassMicrophoneStatus>({ phase: 'idle' });
  const [microphoneInput, setMicrophoneInput] = useState<ClassMicrophoneInput | null>(null);
  const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const capture = useRef<AbortController | null>(null);
  const finish = useRef<(() => Promise<void>) | undefined>(undefined);
  const cursor = useRef(0);
  const session = history.find(item => item.id === olderSessionId) ?? latest;
  const sessionId = session?.id;
  const live = Boolean(sessionId && active?.id === sessionId && !session?.ended_at);
  const capturing = microphone.phase !== 'idle' && microphone.phase !== 'error';
  const canStopCapture = capturing && microphone.phase !== 'stopping';

  useEffect(() => {
    setSession(null);
    setHistory([]);
    setOlderSessionId('');
    setUpcoming(null);
  }, [courseId]);

  useEffect(() => {
    if (!liveClassStatus) return;
    setSession(liveClassStatus.session);
    setHistory(liveClassStatus.history);
    setActive(liveClassStatus.active);
    setUpcoming(liveClassStatus.upcoming);
  }, [liveClassStatus]);

  useEffect(() => {
    setDetails(null);
    setLiveSegments([]);
    cursor.current = 0;
    if (!sessionId) return;
    let current = true;
    let loading = false;
    async function refreshDetails() {
      if (loading) return;
      loading = true;
      try {
        const { data } = await classModeService.details(sessionId!, cursor.current);
        if (!current) return;
        cursor.current = data.segments.at(-1)?.sequence ?? cursor.current;
        const savedThrough = cursor.current;
        setLiveSegments(previous => previous.filter(segment => segment.sequence > savedThrough));
        setDetails(previous => ({
          ...data,
          segments: [...(previous && previous.session.id === sessionId ? previous.segments : []), ...data.segments],
        }));
      } catch (failure) {
        if (current) setError(errorMessage(failure));
      } finally {
        loading = false;
      }
    }
    void refreshDetails();
    const timer = window.setInterval(refreshDetails, 2000);
    return () => { current = false; window.clearInterval(timer); };
  }, [sessionId]);

  useEffect(() => {
    if (live) return;
    capture.current?.abort();
    capture.current = null;
    finish.current = undefined;
    setInterim('');
    setMicrophone({ phase: 'idle' });
    setMicrophoneInput(null);
  }, [live, sessionId]);

  useEffect(() => () => capture.current?.abort(), []);

  async function perform(task: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try { await task(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function connectMic() {
    if (!sessionId) return;
    setError('');
    setMicrophoneInput(null);
    capture.current?.abort();
    const controller = new AbortController();
    capture.current = controller;
    setMicrophone({ phase: 'permission' });
    try {
      const dispose = await openClassMicrophone(sessionId, controller.signal, setInterim, segment => {
        if (segment.sequence > cursor.current) setLiveSegments(previous => [...previous, segment]);
      }, setMicrophone, setMicrophoneInput);
      if (capture.current === controller) finish.current = dispose;
    } catch (failure) {
      controller.abort();
      if (capture.current !== controller) return;
      capture.current = null;
      setMicrophone({ phase: 'error', message: errorMessage(failure) });
    }
  }

  async function stopMic() {
    setMicrophone({ phase: 'stopping' });
    const controller = capture.current;
    const dispose = finish.current;
    capture.current = null;
    finish.current = undefined;
    try {
      await dispose?.();
    } finally {
      controller?.abort();
      setInterim('');
      setMicrophone({ phase: 'idle' });
      setMicrophoneInput(null);
    }
  }

  const segments = [...new Map([...(details?.segments ?? []), ...liveSegments]
    .map(segment => [segment.sequence, segment])).values()].sort((first, second) => first.sequence - second.sequence);
  const summaries = details?.chunks.flatMap(chunk => chunk.result ? [chunk.result] : []) ?? [];
  const pending = details?.chunks.some(chunk => ['pending', 'processing'].includes(chunk.status));
  const failed = details?.chunks.some(chunk => chunk.status === 'failed');
  const labels = { topics: 'Topics', key_points: 'Key points', important_concepts: 'Important concepts' };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Class Mode" />
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <BookOpen size={19} />
            </div>
            <div className="min-w-0">
              <h3 className="break-words font-bold text-slate-900">{selectedCourse?.title || 'Select a course'}</h3>
              {session && <p className="mt-0.5 text-xs text-slate-500">
                {session.ended_at ? 'Ended' : 'Started'} {displayTime(session.ended_at || session.started_at, session.timezone)}
              </p>}
              {upcoming && !live && <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-blue-700">
                <CalendarClock size={14} /> Scheduled start {displayTime(upcoming, session?.timezone)}
              </p>}
            </div>
          </div>
          <span className={live
            ? 'rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800'
            : 'rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600'}>
            {live ? 'Class active' : session?.ended_at ? 'Class ended' : 'Class ready'}
          </span>
        </div>
        <div className="grid gap-3 sm:max-w-xs">
          <label className="block text-sm font-medium text-slate-700 sm:hidden">Course
            <select className={input} value={courseId ?? ''} disabled={capturing} onChange={event => selectCourse(event.target.value)}>
              {!courses.length && <option value="">No courses available</option>}
              {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          {history.length > 1 && <label className="block text-sm font-medium text-slate-700">Session
            <select className={input} value={olderSessionId} disabled={capturing}
              onChange={event => setOlderSessionId(event.target.value)}>
              <option value="">Latest session</option>
              {history.slice(1).map(item => <option key={item.id} value={item.id}>
                {displayTime(item.started_at, item.timezone)}
              </option>)}
            </select>
          </label>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {active && active.course_id !== courseId ? <Button variant="outline"
            onClick={() => selectCourse(active.course_id)}>Open active class in {active.course}</Button>
            : !live && <Button disabled={busy || !courseId || Boolean(active)} leftIcon={<Mic size={15} />}
            onClick={() => void perform(async () => {
              const { data } = await classModeService.start(courseId!);
              setOlderSessionId('');
              setSession(data);
              setActive(data);
            })}>Start Class Mode</Button>}
          {live && <>
            {capturing ? <Button variant="outline" disabled={!canStopCapture || busy} leftIcon={<Square size={14} />}
              onClick={() => void perform(stopMic)}>Stop transcription</Button> :
              <Button disabled={busy} onClick={() => { void connectMic(); }} leftIcon={<Mic size={16} />}>
                {microphone.phase === 'error' ? 'Retry live transcription' : 'Start live transcription'}
              </Button>}
            <Button variant="outline" disabled={busy} onClick={() => void perform(async () => {
              await stopMic();
              if (sessionId) setSession((await classModeService.stop(sessionId)).data);
              setActive(null);
            })}>End class</Button>
          </>}
        </div>
        {microphone.phase === 'error' ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <CircleAlert size={16} className="mt-0.5 shrink-0" /> {microphone.message}
          </div>
        ) : microphone.phase !== 'idle' && (
          <div role="status" className={microphone.phase === 'listening'
            ? 'flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
            : 'flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800'}>
            <AudioLines size={16} className="shrink-0" />
            {'warning' in microphone ? microphone.warning : microphoneCopy[microphone.phase]}
          </div>
        )}
        {capturing && microphoneInput && <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-600">
            <label htmlFor="class-mic-level" className="font-semibold">Microphone level</label>
            <span className="break-words">{microphoneInput.device}</span>
          </div>
          <meter id="class-mic-level" className="block h-2 w-full accent-emerald-500"
            min={0} max={1} value={microphoneInput.level} />
          {microphoneInput.state === 'no_frames' && <p className="text-xs text-amber-800">
            The browser opened the microphone but isn’t receiving audio. Stop transcription, check your input device, and try again.
          </p>}
          {microphoneInput.state === 'quiet' && !segments.length && !interim && <p className="text-xs text-amber-800">
            The microphone signal is quiet. Unmute it or check the selected input in Windows sound settings.
          </p>}
          {microphoneInput.state === 'sending' && <p className="text-xs text-slate-600">
            The microphone is picking up sound. Waiting for the server to receive it.
          </p>}
          {microphoneInput.state === 'received' && !segments.length && !interim && <p className="text-xs text-slate-600">
            Audio is reaching MUAWIN. If captions are delayed, pause briefly after a sentence.
          </p>}
        </div>}
        {(error || liveClassError) && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error || liveClassError}</p>}
      </section>

      {session && <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel}>
          <h3 className="flex items-center gap-2 font-bold text-slate-900"><AudioLines size={17} className="text-blue-600" /> Transcript</h3>
          <div className="min-h-36 max-h-96 space-y-3 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-800">
            {segments.map(segment => <p className="whitespace-pre-wrap wrap-break-word leading-relaxed" dir="auto" key={segment.sequence}>{segment.text}</p>)}
            {interim && <p className="whitespace-pre-wrap wrap-break-word text-slate-500" dir="auto">{interim}</p>}
            {!segments.length && !interim && <p className="text-slate-500">
              {microphone.phase === 'listening' ? 'Waiting for speech.' : 'No transcript yet.'}
            </p>}
          </div>
        </section>
        <section className={panel}>
          <h3 className="flex items-center gap-2 font-bold text-slate-900"><NotebookPen size={17} className="text-blue-600" /> Lecture insights</h3>
          {pending && <p role="status">Analyzing transcript…</p>}
          {failed && <Button variant="outline" disabled={busy}
            onClick={() => void perform(() => classModeService.retry(session.id))}>Retry failed analysis</Button>}
          {!summaries.length && !pending && !failed && <p className="text-sm text-slate-500">
            Insights appear after a transcript chunk is ready.
          </p>}
          {(Object.keys(labels) as Array<keyof typeof labels>).map(key => {
            const values = [...new Set(summaries.flatMap(summary => summary[key]))];
            return values.length > 0 && <div key={key}>
              <h3 className="text-sm font-semibold">{labels[key]}</h3>
              <ul className="list-disc pl-5 text-sm">{values.map(value => <li key={value}>{value}</li>)}</ul>
            </div>;
          })}
        </section>
      </div>}

      {!!details?.suggestions.length && <section className="space-y-3">
        <h2 className="text-lg font-semibold">Academic activities</h2>
        {details.suggestions.map(suggestion =>
          <Suggestion key={suggestion.id} session={details.session} suggestion={suggestion} />)}
      </section>}
    </div>
  );
}

function Suggestion({ session, suggestion }: { session: ClassSession; suggestion: ClassSuggestion }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const { payload, decision, review } = suggestion;
  const last = suggestion.workflows.at(-1);
  const canPrepare = payload.operation && (decision === 'proposed' ||
    (decision === 'prepared' && ['failed', 'interrupted'].includes(last?.status ?? '')));
  const withDate = (phrase?: string, date?: string) =>
    phrase && date && phrase !== date ? phrase + ' (' + date + ')' : phrase;
  const fields = {
    Availability: withDate(payload.availability, payload.availability_date_iso),
    Deadline: withDate(payload.deadline, payload.deadline_date_iso),
    'Assessment date': withDate(payload.assessment_date, payload.assessment_date_iso),
    Coverage: payload.coverage, Instructions: payload.instructions, Evidence: payload.evidence,
  };
  const localValue = (value?: string) => value?.slice(0, 16) ?? '';
  function classTime(value: FormDataEntryValue | null) {
    if (!value) return undefined;
    const formatted = new Intl.DateTimeFormat('en', { timeZone: session.timezone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(value.toString() + ':00Z'));
    const label = formatted.find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
    return value.toString() + ':00' + (label === 'GMT' ? '+00:00' : label.replace('GMT', ''));
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback('');
    try {
      const { data } = await classModeService.prepare(session.id, suggestion.id, {
        title: values.get('title'), week: Number(values.get('week')), material: values.get('material'),
        marks: values.get('marks') ? Number(values.get('marks')) : undefined,
        instructions: values.get('instructions'),
        deadline: classTime(values.get('deadline')), publish_from: classTime(values.get('publish_from')),
        confirm: values.get('confirm') === 'on',
      });
      setFeedback(data.error || (data.status === 'waiting_approval' ? 'Workflow ready for approval.' : data.status));
    } catch (failure) { setFeedback(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function reject() {
    setBusy(true);
    try {
      await classModeService.reject(session.id, suggestion.id);
      setFeedback('Suggestion rejected.');
    } catch (failure) { setFeedback(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  return (
    <article className={panel}>
      <h3 className="font-semibold">{payload.name || payload.type.replaceAll('_', ' ')}</h3>
      <p className="text-sm capitalize text-slate-600">{payload.intent.replaceAll('_', ' ')} · {decision}</p>
      {payload.requires_clarification && <p className="text-sm text-amber-800">Requires teacher clarification.</p>}
      {Object.entries(fields).map(([label, value]) => value && <p className="text-sm" key={label}>
        <strong>{label}</strong> {value}
      </p>)}
      {last && <div className="space-y-1 text-sm">
        <p>Workflow {last.status.replaceAll('_', ' ')}</p>
        {last.error && <p className="text-red-700">{last.error}</p>}
        {last.result != null && <p className="whitespace-pre-wrap break-words">{typeof last.result === 'string'
          ? last.result : JSON.stringify(last.result, null, 2)}</p>}
        {last.status === 'waiting_approval' && <Link className="underline" to={'/approvals/' + last.id}>Review approval</Link>}
      </div>}
      {canPrepare && <form className="space-y-3 text-sm" onSubmit={prepare}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Title<input className={input} name="title" defaultValue={review?.title || payload.name} required maxLength={250} /></label>
          <label>Course week<input className={input} name="week" type="number" defaultValue={review?.week} min={1} max={52} required /></label>
          <label>{payload.operation === 'upload_lecture' ? 'Lecture file name in your course folder' : 'Source lecture name, if specified'}
            <input className={input} name="material" defaultValue={review?.material} required={payload.operation === 'upload_lecture'} /></label>
          {payload.operation === 'create_assignment' && <>
            <label>Total marks<input className={input} name="marks" type="number" min={1} max={1000} defaultValue={review?.marks} required /></label>
            <label>Submission deadline ({session.timezone})<input className={input} type="datetime-local" name="deadline" defaultValue={localValue(review?.deadline)} required /></label>
            <label>Assignment instructions<textarea className={input} name="instructions" maxLength={4000}
              defaultValue={review?.instructions ?? payload.instructions} /></label>
          </>}
          <label>Publish from ({session.timezone})<input className={input} type="datetime-local" name="publish_from" defaultValue={localValue(review?.publish_from)} required={Boolean(payload.availability)} /></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required />
          I confirm this Moellim instruction and the details above.</label>
        <Button type="submit" disabled={busy}>Prepare for approval</Button>
      </form>}
      {decision === 'proposed' && <Button variant="outline" disabled={busy} onClick={() => void reject()}>Reject suggestion</Button>}
      {feedback && <p role="status" className="text-sm">{feedback}</p>}
    </article>
  );
}
