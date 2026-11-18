import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarDays, FolderOpen, UploadCloud, RefreshCw, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { featureService,  ClassScheduleSlot } from '../services/featureService';

export const CourseSetup: React.FC = () => {
  const { courses, selectedCourse, selectCourse, addToast } = useApp();
  const course = selectedCourse?.title || selectedCourse?.code || '';
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [classSlots, setClassSlots] = useState<ClassScheduleSlot[]>([]);

  const [folderPath, setFolderPath] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [outlineStatus, setOutlineStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [moellimJob, setMoellimJob] = useState<any>(null);


  const loadRequestId = useRef(0);

  const load = async () => {
    const requestedCourse = course;
    const requestId = ++loadRequestId.current;

    setMessage('');
    setReadiness(null);
    setOutlineStatus(null);

    setClassSlots([]);
    setFolderPath('');
    setCandidates([]);

    if (!requestedCourse) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await featureService.setup(requestedCourse);
      if (requestId !== loadRequestId.current) return;

      setReadiness(res.data.readiness || null);
      setOutlineStatus(
        res.data.outline_status ||
        (res.data.outlines || []).find((x: any) => x.course === requestedCourse) ||
        null
      );

      const setup = res.data.setup || {};
      setFolderPath(setup.folder_path || '');

      try {
        const scheduleRes = await featureService.classSchedule(requestedCourse);
        if (requestId !== loadRequestId.current) return;
        setClassSlots(scheduleRes.data.slots || []);
      } catch (scheduleError) {
        if (requestId === loadRequestId.current) {
          console.warn('Class schedule could not be loaded:', scheduleError);
        }
      }
    } catch (e: any) {
      if (requestId === loadRequestId.current) {
        setMessage(e.message || 'Could not load course setup.');
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void load();
    return () => {
      loadRequestId.current += 1;
    };
  }, [course]);

  const handleOutline = async () => {
    if (!course || !outlineFile) return;
    setLoading(true); setMessage('');
    try {
      const res = await featureService.uploadOutline(course, outlineFile);
      setMessage(`Outline saved: ${res.data.clos} CLOs and ${res.data.weeks} weeks.`);
      addToast('success', 'Course outline saved', 'CLO and weekly topic data is now available to MUAWIN.');
      setOutlineFile(null); await load();
    } catch (e: any) { setMessage(e.message || 'Outline upload failed.'); }
    finally { setLoading(false); }
  };

  const addClassSlot = () => {
    setClassSlots(old => [...old, {
      weekday: 0,
      start_time: '09:00',
      end_time: '10:00',
      auto_lecture: true,
      auto_assignment: false,
    }]);
  };

  const updateClassSlot = (
    index: number,
    key: keyof ClassScheduleSlot,
    value: string | number | boolean
  ) => {
    setClassSlots(old => old.map((slot, i) =>
      i === index ? { ...slot, [key]: value } : slot
    ));
  };

  const handleSaveClassSchedule = async () => {
    if (!course) return;
    if (!classSlots.length) {
      setMessage('Please add at least one class session.');
      return;
    }
    for (const slot of classSlots) {
      if (!slot.start_time || !slot.end_time || slot.end_time <= slot.start_time) {
        setMessage('Each class session must have a valid start and end time.');
        return;
      }
    }

    setLoading(true);
    setMessage('');
    try {
      const res = await featureService.saveClassSchedule(course, classSlots);
      setClassSlots(res.data.slots || classSlots);
      setMessage('Class days and timings saved successfully.');
      addToast('success', 'Class schedule saved', 'Your weekly class timings are saved.');
    } catch (e: any) {
      setMessage(e.message || 'Could not save class schedule.');
    } finally {
      setLoading(false);
    }
  };

  const handleFolder = async () => {
    if (!course || !folderPath.trim()) return;
    setLoading(true); setMessage('');
    try {
      await featureService.saveFolder(course, folderPath.trim());
      setMessage('Course folder saved. You can now scan it for lecture candidates.');
      addToast('success', 'Folder saved', 'MUAWIN will only scan this selected folder.');
      await load();
    } catch (e: any) { setMessage(e.message || 'Could not save folder.'); }
    finally { setLoading(false); }
  };

  const handleScan = async () => {
    if (!course || !folderPath.trim()) {
      setMessage('Please enter the course folder path first.');
      return;
    }
    setLoading(true); setMessage('');
    try {
      await featureService.saveFolder(course, folderPath.trim());
      const res = await featureService.scanFolder(course);
      setCandidates(res.data.candidates || []);
      setMessage(`${res.data.candidates?.length || 0} candidate files found. Folder saved and scanned successfully.`);
      await load();
    } catch (e: any) { setMessage(e.message || 'Folder scan failed.'); }
    finally { setLoading(false); }
  };

  const handleConfirmCandidate = async (id: number) => {
    try {
      await featureService.confirmCandidate(id);
      setCandidates(old => old.map(c => c.id === id ? { ...c, status: 'confirmed' } : c));
      addToast('success', 'File confirmed', 'This candidate is marked as teacher-confirmed. It has not been uploaded.');
    } catch (e: any) { setMessage(e.message || 'Could not confirm candidate.'); }
  };

  const handlePrepareMoellim = async () => {
    if (!course) return;
    if (!readiness?.outline_ready || !classSlots.length || !readiness?.folder_ready) {
      setMessage('Complete the Course Outline, save Class Days & Timings, and select the Lecture Folder first.');
      return;
    }
setLoading(true); setMessage('');
    try {
      const res = await featureService.prepareSavedMoellimDocuments(course);
      setMoellimJob(res.data);
      setMessage('Original documents are ready. Review and approve before uploading to Moellim General.');
      addToast('success', 'Setup ready for approval', 'Course Outline and Class Schedule are prepared.');
    } catch (e: any) {
      setMessage(e.message || 'Could not prepare original setup documents.');
    } finally { setLoading(false); }
  };

  const handleApproveMoellim = async () => {
    if (!moellimJob?.job_id) return;
    setLoading(true); setMessage('');
    try {
      const res = await featureService.approveMoellimDocuments(moellimJob.job_id);
      setMoellimJob(res.data);
      setMessage('Teacher approval saved. You can now upload the Course Outline and Class Schedule to Moellim General.');
    } catch (e: any) {
      setMessage(e.message || 'Approval failed.');
    } finally { setLoading(false); }
  };

  const handleExecuteMoellim = async () => {
    if (!moellimJob?.job_id || moellimJob.status !== 'approved') return;
    setLoading(true); setMessage('Uploading Course Outline and Class Schedule to Moellim General...');
    try {
      const res = await featureService.executeMoellimDocuments(moellimJob.job_id);
      setMoellimJob(res.data);
      setMessage(res.data.message || `Moellim upload status: ${res.data.status}`);
      if (res.data.status === 'completed') {
        addToast('success', 'Course setup uploaded', 'Course Outline and Class Schedule were uploaded and verified in Moellim General.');
      }
      await load();
    } catch (e: any) {
      setMessage(e.message || 'Moellim upload failed.');
    } finally { setLoading(false); }
  };

  if (!courses.length) return <div className="p-8 bg-white rounded-2xl border text-slate-600">Log in to Moellim to load your assigned courses.</div>;

  return <div className="max-w-6xl mx-auto space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Configuration</p><h1 className="text-2xl font-extrabold text-slate-900 mt-1">Course Setup</h1><p className="text-sm text-slate-500 mt-1">Upload the course outline, save class days and timings and select a lecture folder.</p></div>
      <select value={selectedCourse?.id || ''} onChange={e => selectCourse(e.target.value)} className="min-w-64 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
        {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </div>

    {message && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {[['Course outline',!!outlineStatus,'CLO mapping source'],['Class Schedule',!!classSlots.length,'Saved class days and timings'],['Lecture folder',!!readiness?.folder_ready,'Selected local folder']].map(([label,ok,desc]: any) =>
        <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ok ? 'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{ok ? <CheckCircle2/> : <AlertCircle/>}</div>
          <div><p className="font-bold text-sm text-slate-900">{label}</p><p className="text-xs text-slate-500">{ok ? 'Ready' : desc}</p></div>
        </div>)}
    </div>

<section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3"><BookOpen className="text-blue-600"/><div><h2 className="font-bold text-slate-900">1. Course Outline</h2><p className="text-xs text-slate-500">Upload the outline for the selected course. MUAWIN uses it for CLO mapping.</p></div></div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input type="file" accept=".pdf,.docx" onChange={e => setOutlineFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"/>
        <button onClick={handleOutline} disabled={!outlineFile || loading} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Upload Outline</button>
      </div>
    </section>

    

    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <CalendarDays className="text-blue-600"/>
        <div>
          <h2 className="font-bold text-slate-900">2. Class Days & Timings</h2>
          <p className="text-xs text-slate-500">Enter the actual class sessions from your timetable. Add only the days and times shown on your timetable; Saturday and Sunday remain off unless you add them.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-slate-800">Class sessions ({classSlots.length})</h3>
        <button onClick={addClassSlot} className="text-sm font-semibold text-blue-700">+ Add class session</button>
      </div>

      {classSlots.map((slot, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <select
            value={slot.weekday}
            onChange={e => updateClassSlot(i, 'weekday', Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, d) =>
              <option key={day} value={d}>{day}</option>
            )}
          </select>
          <label className="text-xs text-slate-500">Start
            <input type="time" value={slot.start_time}
              onChange={e => updateClassSlot(i, 'start_time', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
          </label>
          <label className="text-xs text-slate-500">End
            <input type="time" value={slot.end_time}
              onChange={e => updateClassSlot(i, 'end_time', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
          </label>
          <button onClick={() => setClassSlots(old => old.filter((_, j) => j !== i))}
            className="text-xs text-rose-600">Remove</button>
        </div>
      ))}

      {!classSlots.length && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
          No class sessions added yet. Add the actual class day and start/end time.
        </p>
      )}

      <button onClick={handleSaveClassSchedule} disabled={loading || !classSlots.length}
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        Save Class Schedule
      </button>
    </section>

    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3"><FolderOpen className="text-blue-600"/><div><h2 className="font-bold text-slate-900">3. Course Lecture Folder</h2><p className="text-xs text-slate-500">Select a local folder. Scanning only finds candidate files; no file is uploaded automatically.</p></div></div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input value={folderPath} onChange={e=>setFolderPath(e.target.value)} placeholder="C:\Users\...\Course Lectures" className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
        <button onClick={handleFolder} disabled={loading || !folderPath.trim()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Save Folder</button>
        <button onClick={handleScan} disabled={loading || !folderPath.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Scan Folder</button>
      </div>
      {candidates.length>0 && <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
        {candidates.map(c=><div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p><p className="text-xs text-slate-500 truncate">{c.path}</p></div>{c.status==='confirmed' ? <span className="text-xs font-bold text-emerald-700">Teacher confirmed</span> : <button onClick={()=>handleConfirmCandidate(c.id)} className="text-xs font-semibold text-blue-700">Confirm candidate</button>}</div>)}
      </div>}
    </section>
    <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <UploadCloud className="text-blue-600"/>
        <div>
          <h2 className="font-bold text-slate-900">4. Complete Course Setup</h2>
          <p className="text-xs text-slate-600">Prepare the saved Course Outline and Timetable for teacher approval, then upload both to the selected course's General section in Moellim.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-white border p-3">Outline: <strong>{readiness?.outline_ready ? 'Ready' : 'Pending'}</strong></div>
        <div className="rounded-lg bg-white border p-3">Timetable: <strong>{readiness?.timetable_ready ? 'Ready' : 'Pending'}</strong></div>
        <div className="rounded-lg bg-white border p-3">Folder: <strong>{readiness?.folder_ready ? 'Saved' : 'Pending'}</strong></div>
      </div>

      {!moellimJob && <button
        onClick={handlePrepareMoellim}
        disabled={loading || !readiness?.outline_ready || !readiness?.timetable_ready ||
          !readiness?.class_schedule_ready || !readiness?.folder_ready}
        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
        {loading ? 'Preparing...' : 'Setup Complete ? Prepare for Moellim'}
      </button>}

      {moellimJob && <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-sm text-slate-900">Moellim General Upload</p>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{moellimJob.status}</span>
        </div>
        <p className="text-xs text-slate-600">{moellimJob.message}</p>
        <div className="space-y-1 text-sm">
          {(moellimJob.uploads?.length ? moellimJob.uploads : [
            {resource:'Course Outline',status:'ready_for_approval'},
            {resource:'Course Timetable',status:'ready_for_approval'}
          ]).map((item:any, index:number) => (
            <div key={index} className="flex justify-between gap-3 border-b py-2">
              <span>{item.resource}</span><span className="text-xs text-slate-500">{item.status}</span>
            </div>
          ))}
        </div>

        {moellimJob.status === 'awaiting_approval' && <button
          onClick={handleApproveMoellim}
          disabled={loading}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Please wait...' : 'I Approve ? Continue'}
        </button>}

        {moellimJob.status === 'approved' && <button
          onClick={handleExecuteMoellim}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Uploading to Moellim...' : 'Upload to Moellim General'}
        </button>}

        {moellimJob.status === 'completed' && <p className="text-sm font-semibold text-emerald-700">Course setup completed. Check the General section in Moellim.</p>}
        {moellimJob.status === 'failed' && <p className="text-sm font-semibold text-rose-700">Upload failed: {moellimJob.error || moellimJob.message}</p>}
      </div>}
    </section>

    <div className="flex justify-end"><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 text-sm text-slate-500"><RefreshCw size={15}/> Refresh status</button></div>
  </div>;
};

