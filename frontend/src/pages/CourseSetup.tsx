import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, FolderOpen, RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { featureService, ClassScheduleSlot } from '../services/featureService';

export const CourseSetup: React.FC = () => {
  const { selectedCourse, addToast } = useApp();
  const course = selectedCourse?.title || selectedCourse?.code || '';
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [classSlots, setClassSlots] = useState<ClassScheduleSlot[]>([]);

  const [folderPath, setFolderPath] = useState('');
  const [savedFolderPath, setSavedFolderPath] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState({ outline: false, classSchedule: false });
  const [outlineStatus, setOutlineStatus] = useState<any>(null);
  const [detectedOutlines, setDetectedOutlines] = useState<any[]>([]);
  const [moellimVerification, setMoellimVerification] = useState<any>(null);
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
    setMoellimVerification(null);

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
      setSessionStatus(old => ({
        outline: old.outline || !!res.data.readiness?.outline_ready,
        classSchedule: old.classSchedule || !!res.data.readiness?.class_schedule_ready,
      }));
      setOutlineStatus(
        res.data.outline_status ||
        (res.data.outlines || []).find((x: any) => x.course === requestedCourse) ||
        null
      );

      const setup = res.data.setup || {};
      setFolderPath(setup.folder_path || '');
      setSavedFolderPath(setup.folder_path || '');

      try {
        const scheduleRes = await featureService.classSchedule(requestedCourse);
        if (requestId !== loadRequestId.current) return;
        const savedSlots = scheduleRes.data.slots || [];
        setClassSlots(savedSlots);
      } catch (scheduleError) {
        if (requestId === loadRequestId.current) {
          console.warn('Class schedule could not be loaded:', scheduleError);
        }
      }

      try {
        const verifyRes = await featureService.verifyMoellimSetup(requestedCourse);
        if (requestId !== loadRequestId.current) return;
        const verification = verifyRes.data || null;
        setMoellimVerification(verification);
        const checked = verification?.verification_status === 'verified';
        setSessionStatus(old => ({
          outline: old.outline || (checked && verification?.outline_status === 'verified'),
          classSchedule: old.classSchedule || (checked && verification?.class_schedule_status === 'verified'),
        }));
      } catch (verifyError) {
        if (requestId === loadRequestId.current) {
          console.warn('Moellim setup verification failed:', verifyError);
          setMoellimVerification({
            verification_status: 'unknown',
            outline_status: 'unknown',
            class_schedule_status: 'unknown'
          });
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
    setSessionStatus({ outline: false, classSchedule: false });
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
      setSessionStatus(old => ({ ...old, outline: true }));
      setMessage(`Outline saved: ${res.data.clos} CLOs and ${res.data.weeks} weeks.`);
      addToast('success', 'Course outline saved', 'CLO and weekly topic data is now available to MUAWIN.');
      setOutlineFile(null); await load();
    } catch (e: any) { setMessage(e.message || 'Outline upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDetectOutline = async () => {
    if (!course) return;
    setLoading(true);
    setMessage('');
    setDetectedOutlines([]);
    try {
      const res = await featureService.detectOutline(course);
      const found = res.data.candidates || [];
      setDetectedOutlines(found);
      setMessage(found.length
        ? `Found ${found.length} possible outline file(s). Review the preview and confirm the correct one.`
        : (res.data.message || 'No matching course outline found in the selected folder.'));
    } catch (e: any) {
      setMessage(e.message || 'Automatic outline detection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDetectedOutline = async (filename: string) => {
    if (!course || !filename) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await featureService.confirmDetectedOutline(course, filename);
      setSessionStatus(old => ({ ...old, outline: true }));
      setDetectedOutlines([]);
      setMessage(`Outline saved: ${res.data.clos} CLOs and ${res.data.weeks} weeks.`);
      addToast('success', 'Course outline confirmed', 'The detected outline is saved and available for CLO mapping.');
      await load();
    } catch (e: any) {
      setMessage(e.message || 'Could not confirm the detected outline.');
    } finally {
      setLoading(false);
    }
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
      setSessionStatus(old => ({ ...old, classSchedule: true }));
      setClassSlots(res.data.slots || classSlots);
      setReadiness((old: any) => ({ ...(old || {}), class_schedule_ready: true }));
      if (res.data?.moellim_upload?.skipped) {
        setMessage(res.data.moellim_upload.message || 'Class schedule saved. Timetable was already uploaded on Moellim General.');
        addToast('success', 'Class schedule synced', 'Timetable already exists on Moellim General—your schedule is saved.');
      } else {
        setMessage('Class days and timings saved successfully.');
        addToast('success', 'Class schedule saved', 'Your weekly class timings are saved.');
      }
    } catch (e: any) {
      setMessage(e.message || 'Could not save class schedule.');
    } finally {
      setLoading(false);
    }
  };

  const handleFolder = async () => {
    if (!course || !folderPath.trim()) return;
    setLoading(true);
    setMessage('');

    try {
      const res = await featureService.saveFolder(course, folderPath.trim());
      const outline = res.data?.outline;
      await load();

      if (outline?.status === 'already_uploaded') {
        setSessionStatus(old => ({
          ...old,
          outline: true,
          classSchedule: old.classSchedule || !!outline.timetable_uploaded,
        }));
        setMessage(
          outline.message ||
          'Folder saved. Course outline and timetable were already uploaded by a fellow teacher; CLOs mapped.'
        );
        addToast(
          'success',
          'Course setup synced',
          outline.timetable_uploaded
            ? 'Outline, CLOs, and timetable from your fellow teacher are active.'
            : 'Outline & CLOs from your fellow teacher are active.'
        );
      } else if (outline?.status === 'uploaded') {
        setMessage(`Folder saved. Course outline "${outline.filename || ''}" was automatically uploaded to Moellim General.`);
        addToast('success', 'Course outline uploaded', 'MUAWIN detected the outline and uploaded it to Moellim General.');
      } else if (outline?.status === 'ambiguous') {
        setMessage(outline.message || 'Folder saved, but multiple possible outlines were found. No outline was uploaded.');
        addToast('success', 'Folder saved', 'No outline was uploaded because the folder contains multiple possible outlines.');
      } else if (outline?.status === 'not_found') {
        setMessage(outline.message || 'Folder saved, but no valid course outline was found. No document was uploaded.');
        addToast('success', 'Folder saved', 'No valid course outline was found in the selected folder.');
      } else if (outline?.status === 'failed') {
        setMessage(outline.message || 'Folder saved, but automatic outline upload failed.');
      } else {
        setMessage(res.data?.message || 'Folder saved. MUAWIN will use only this folder for course-file detection.');
        addToast('success', 'Folder saved', 'MUAWIN will only scan this selected folder.');
      }
    } catch (e: any) {
      setMessage(e.message || 'Could not save folder.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearFolder = async () => {
    if (!course) return;
    setLoading(true); setMessage('');
    try {
      await featureService.saveFolder(course, '');
      setFolderPath('');
      setCandidates([]);
      setMessage('Saved lecture folder cleared. Select a folder before scanning or uploading lectures.');
      addToast('success', 'Lecture folder cleared', 'No local folder is currently selected for this course.');
      await load();
    } catch (e: any) { setMessage(e.message || 'Could not clear folder.'); }
    finally { setLoading(false); }
  };

  const handleScan = async () => {
    if (!course || !folderPath.trim()) {
      setMessage('Please enter the course folder path first.');
      return;
    }

    if (!savedFolderPath || folderPath.trim() !== savedFolderPath.trim()) {
      setMessage('Please save this folder first. MUAWIN only scans the saved course folder.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await featureService.scanFolder(course);
      const found = res.data.candidates || [];
      setCandidates(found);
      setMessage(`${found.length} candidate files found in the saved course folder.`);
    } catch (e: any) {
      setMessage(e.message || 'Folder scan failed.');
    } finally {
      setLoading(false);
    }
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

  if (!course) return <div className="p-8 bg-white rounded-2xl border text-slate-600">Select a Moellim course before configuring its folder and class schedule.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Configure
          </h2>
        </div>
      </div>

      {message && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs font-medium text-blue-900">
          {message}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <FolderOpen className="text-blue-600" />
          <div>
            <h2 className="font-bold text-slate-900">Restrict Course Folder</h2>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="C:\Users\...\Course Lectures"
            className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
          <div className="flex flex-wrap sm:flex-nowrap gap-2.5 shrink-0">
            <button
              onClick={handleFolder}
              disabled={loading || !folderPath.trim()}
              className={`flex-1 sm:flex-none whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                folderPath.trim() && folderPath.trim() !== savedFolderPath.trim()
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-600'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {folderPath.trim() && folderPath.trim() === savedFolderPath.trim()
                ? 'Folder Saved'
                : 'Save Folder'}
            </button>
            <button
              onClick={handleScan}
              disabled={loading || !savedFolderPath.trim() || folderPath.trim() !== savedFolderPath.trim()}
              className="flex-1 sm:flex-none whitespace-nowrap rounded-xl bg-white hover:bg-blue-50 border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Scan Folder
            </button>
            <button
              onClick={handleClearFolder}
              disabled={loading || (!folderPath.trim() && !readiness?.folder_ready)}
              className="flex-1 sm:flex-none whitespace-nowrap rounded-xl hover:bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Clear Folder
            </button>
          </div>
        </div>
        {candidates.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {candidates.map(c => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 truncate">{c.path}</p>
                </div>
                {c.status === 'confirmed' ? (
                  <span className="text-xs font-bold text-emerald-700">Teacher confirmed</span>
                ) : (
                  <button onClick={() => handleConfirmCandidate(c.id)} className="text-xs font-semibold text-blue-700">
                    Confirm candidate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="text-blue-600" />
          <div>
            <h2 className="font-bold text-slate-900">Class Days & Timings</h2>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-800">Class sessions ({classSlots.length})</h3>
          <button onClick={addClassSlot} className="text-sm font-semibold text-blue-700 hover:text-blue-800 cursor-pointer">
            + Add class session
          </button>
        </div>

        <div className="space-y-3">
          {classSlots.map((slot, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
              <label className="block text-xs font-medium text-slate-500">
                Day
                <select
                  value={slot.weekday}
                  onChange={e => updateClassSlot(i, 'weekday', Number(e.target.value))}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-blue-600"
                >
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, d) => (
                    <option key={day} value={d}>{day}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-500">
                Start
                <input
                  type="time"
                  value={slot.start_time}
                  onChange={e => updateClassSlot(i, 'start_time', e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:outline-blue-600"
                />
              </label>

              <label className="block text-xs font-medium text-slate-500">
                End
                <input
                  type="time"
                  value={slot.end_time}
                  onChange={e => updateClassSlot(i, 'end_time', e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:outline-blue-600"
                />
              </label>

              <button
                type="button"
                onClick={() => setClassSlots(old => old.filter((_, j) => j !== i))}
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer justify-self-end sm:justify-self-auto"
                title="Remove session"
                aria-label="Remove session"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {!classSlots.length && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
            No class sessions added yet. Add the actual class day and start/end time.
          </p>
        )}

        <button
          onClick={handleSaveClassSchedule}
          disabled={loading || !classSlots.length}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors cursor-pointer"
        >
          Save Class Schedule
        </button>
      </section>

      <div className="flex justify-end">
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw size={15} /> Refresh status
        </button>
      </div>
    </div>
  );
};