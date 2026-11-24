import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { featureService, ClassScheduleSlot } from '../services/featureService';
import { api } from '../services/api';

type ProcessingStep = {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
};

const INITIAL_FOLDER_STEPS: ProcessingStep[] = [
  { id: 'save', label: 'Saving restricted course folder path', status: 'pending' },
  { id: 'scan', label: 'Scanning folder for course outline', status: 'pending' },
  { id: 'verify', label: 'Checking Moellim General section', status: 'pending' },
  { id: 'sync', label: 'Uploading outline & mapping CLOs', status: 'pending' },
];

const INITIAL_SCHEDULE_STEPS: ProcessingStep[] = [
  { id: 'validate', label: 'Validating class days & timings', status: 'pending' },
  { id: 'save', label: 'Saving class schedule', status: 'pending' },
  { id: 'check', label: 'Checking Moellim General section', status: 'pending' },
  { id: 'upload', label: 'Uploading schedule to Moellim General', status: 'pending' },
];

export const CourseSetup: React.FC = () => {
  const { selectedCourse, addToast } = useApp();
  const course = selectedCourse?.title || selectedCourse?.code || '';
  const [classSlots, setClassSlots] = useState<ClassScheduleSlot[]>([]);

  const [folderPath, setFolderPath] = useState('');
  const [savedFolderPath, setSavedFolderPath] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState({ outline: false, classSchedule: false });
  const [moellimVerification, setMoellimVerification] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const hosted = !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const [uploading, setUploading] = useState(false);

  // Processing card state when saving folder
  const [folderProcessing, setFolderProcessing] = useState(false);
  const [folderProcessingTitle, setFolderProcessingTitle] = useState('');
  const [folderSteps, setFolderSteps] = useState<ProcessingStep[]>(INITIAL_FOLDER_STEPS);

  // Processing card state when saving class schedule
  const [scheduleProcessing, setScheduleProcessing] = useState(false);
  const [scheduleProcessingTitle, setScheduleProcessingTitle] = useState('');
  const [scheduleSteps, setScheduleSteps] = useState<ProcessingStep[]>(INITIAL_SCHEDULE_STEPS);

  const loadRequestId = useRef(0);

  const setActiveFolderStep = (activeId: string, title: string) => {
    setFolderProcessingTitle(title);
    setFolderSteps(prev => {
      const activeIdx = prev.findIndex(s => s.id === activeId);
      return prev.map((step, idx) => ({
        ...step,
        status: idx < activeIdx ? 'done' : idx === activeIdx ? 'active' : 'pending',
      }));
    });
  };

  const completeAllFolderSteps = () => {
    setFolderSteps(prev => prev.map(step => ({ ...step, status: 'done' })));
  };

  const setActiveScheduleStep = (activeId: string, title: string) => {
    setScheduleProcessingTitle(title);
    setScheduleSteps(prev => {
      const activeIdx = prev.findIndex(s => s.id === activeId);
      return prev.map((step, idx) => ({
        ...step,
        status: idx < activeIdx ? 'done' : idx === activeIdx ? 'active' : 'pending',
      }));
    });
  };

  const completeAllScheduleSteps = () => {
    setScheduleSteps(prev => prev.map(step => ({ ...step, status: 'done' })));
  };

  const pickSingleOutlineCandidate = (items: any[]) => {
    const valid = items.filter((item: any) => {
      const name = String(item.filename || item.name || '').trim();
      return name && !name.startsWith('~$') && !name.startsWith('.');
    });

    if (valid.length === 1) return valid[0];

    const explicit = valid.filter((item: any) => {
      const name = String(item.filename || item.name || '').toLowerCase();
      const isOutlineName = name.includes('outline') || name.includes('syllabus');
      const isLectureOrTask = /\b(lecture|lec|week|assignment|quiz|lab)\b/.test(name);
      return isOutlineName && !isLectureOrTask;
    });

    if (explicit.length === 1) return explicit[0];
    return null;
  };

  const load = async (preserveMessage = false) => {
    const requestedCourse = course;
    const requestId = ++loadRequestId.current;

    if (!preserveMessage) {
      setMessage('');
    }
    setReadiness(null);
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
            class_schedule_status: 'unknown',
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

  const addClassSlot = () => {
    setClassSlots(old => [
      ...old,
      {
        weekday: 0,
        start_time: '09:00',
        end_time: '10:00',
        auto_lecture: true,
        auto_assignment: false,
      },
    ]);
  };

  const updateClassSlot = (
    index: number,
    key: keyof ClassScheduleSlot,
    value: string | number | boolean
  ) => {
    setClassSlots(old =>
      old.map((slot, i) => (i === index ? { ...slot, [key]: value } : slot))
    );
  };

  const handleSaveClassSchedule = async () => {
    if (!course || loading) return;
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
    setScheduleProcessing(true);
    setScheduleSteps(INITIAL_SCHEDULE_STEPS);
    setActiveScheduleStep('validate', 'Validating class days and timings...');

    try {
      setActiveScheduleStep('save', 'Saving class schedule...');
      const res = await featureService.saveClassSchedule(course, classSlots);

      setSessionStatus(old => ({ ...old, classSchedule: true }));
      setClassSlots(res.data.slots || classSlots);
      setReadiness((old: any) => ({ ...(old || {}), class_schedule_ready: true }));

      const uploadResult = res.data?.moellim_upload;

      // Case 1: Backend already uploaded the class schedule to Moellim General
      if (
        uploadResult?.uploaded ||
        uploadResult?.status === 'uploaded' ||
        uploadResult?.status === 'completed'
      ) {
        completeAllScheduleSteps();
        await load(true);
        setMessage(
          uploadResult.message ||
            'Class schedule saved and uploaded to Moellim General.'
        );
        addToast(
          'success',
          'Class schedule uploaded',
          'Your class schedule has been uploaded to Moellim General.'
        );
        return;
      }

      // Case 2: Check Moellim General to see if the schedule is already there
      setActiveScheduleStep('check', 'Checking Moellim General section...');
      let timetableAlreadyOnMoellim = uploadResult?.verified_on_moellim === true;
      try {
        const verifyRes = await featureService.verifyMoellimSetup(course);
        const v = verifyRes.data || {};
        setMoellimVerification(v);
        if (v.verification_status === 'verified' && v.class_schedule_status === 'verified') {
          timetableAlreadyOnMoellim = true;
        }
      } catch {
        // Proceed to upload if verification is inconclusive
      }

      if (uploadResult?.skipped && timetableAlreadyOnMoellim) {
        completeAllScheduleSteps();
        await load(true);
        setMessage(
          uploadResult.message ||
            'Class schedule saved. Timetable already exists in Moellim General.'
        );
        addToast(
          'success',
          'Class schedule synced',
          'Timetable already exists on Moellim General—your schedule is saved.'
        );
        return;
      }

      // Case 3: Not yet on Moellim General — prepare, approve, and execute upload to General
      setActiveScheduleStep('upload', 'Uploading class schedule to Moellim General...');
      const prepRes = await featureService.prepareSavedMoellimDocuments(course);
      const jobId = prepRes.data?.job_id;

      if (jobId) {
        await featureService.approveMoellimDocuments(jobId);
        const execRes = await featureService.executeMoellimDocuments(jobId);

        let scheduleNowVerified = false;
        try {
          const recheck = await featureService.verifyMoellimSetup(course);
          setMoellimVerification(recheck.data || null);
          scheduleNowVerified =
            recheck.data?.verification_status === 'verified' &&
            recheck.data?.class_schedule_status === 'verified';
        } catch {
          // ignore
        }

        completeAllScheduleSteps();
        await load(true);

        if (
          scheduleNowVerified ||
          execRes.data?.status === 'completed'
        ) {
          setMessage('Class schedule saved and uploaded to Moellim General.');
          addToast(
            'success',
            'Class schedule uploaded',
            'Course schedule has been uploaded and verified in Moellim General.'
          );
        } else {
          setMessage(
            execRes.data?.error ||
              execRes.data?.message ||
              'Class schedule saved locally, but Moellim upload did not complete.'
          );
        }
      } else {
        completeAllScheduleSteps();
        await load(true);
        setMessage('Class days and timings saved successfully.');
        addToast('success', 'Class schedule saved', 'Your weekly class timings are saved.');
      }
    } catch (e: any) {
      setMessage(e.message || 'Could not save or upload class schedule.');
    } finally {
      setLoading(false);
      setScheduleProcessing(false);
    }
  };

  const handleFolder = async () => {
    if (!course || !folderPath.trim() || loading) return;
    setLoading(true);
    setMessage('');
    setFolderProcessing(true);
    setFolderSteps(INITIAL_FOLDER_STEPS);
    setActiveFolderStep('save', 'Configuring restricted course folder...');

    const scanTimer = window.setTimeout(() => {
      setActiveFolderStep('scan', 'Scanning restricted folder for Course Outline...');
    }, 900);
    const verifyTimer = window.setTimeout(() => {
      setActiveFolderStep('verify', 'Checking Moellim General section...');
    }, 2200);
    const syncTimer = window.setTimeout(() => {
      setActiveFolderStep('sync', 'Uploading outline and mapping CLOs...');
    }, 4000);

    try {
      const res = await featureService.saveFolder(course, folderPath.trim());
      const outline = res.data?.outline;

      window.clearTimeout(scanTimer);
      window.clearTimeout(verifyTimer);
      window.clearTimeout(syncTimer);
      setActiveFolderStep('verify', 'Verifying course setup status on Moellim...');

      let liveOutlineVerified = outline?.verified_on_moellim === true;
      let liveTimetableVerified = outline?.timetable_uploaded === true;
      try {
        const verifyRes = await featureService.verifyMoellimSetup(course);
        const v = verifyRes.data || {};
        setMoellimVerification(v);
        if (v.verification_status === 'verified') {
          liveOutlineVerified = liveOutlineVerified || v.outline_status === 'verified';
          liveTimetableVerified = liveTimetableVerified || v.class_schedule_status === 'verified';
        }
      } catch {
        // Keep values returned by saveFolder
      }

      await load(true);

      if (outline?.status === 'already_uploaded' && liveOutlineVerified) {
        setSessionStatus(old => ({
          ...old,
          outline: true,
          classSchedule: old.classSchedule || liveTimetableVerified,
        }));
        setMessage(
          liveTimetableVerified
            ? 'Folder saved. Course outline and timetable are verified on Moellim—CLOs mapped and system is ready.'
            : 'Folder saved. Course outline is verified on Moellim—CLOs mapped.'
        );
        addToast(
          'success',
          'Course setup synced',
          liveTimetableVerified
            ? 'Outline, CLOs, and timetable on Moellim are active.'
            : 'Outline & CLOs on Moellim are active.'
        );
      } else if (
        (outline?.status === 'already_uploaded' && !liveOutlineVerified) ||
        outline?.status === 'ambiguous'
      ) {
        setActiveFolderStep('scan', 'Filtering course outline candidates in folder...');
        const detectRes = await featureService.detectOutline(course);
        const found = detectRes.data?.candidates || [];
        const singleMatch = pickSingleOutlineCandidate(found);

        if (singleMatch) {
          const filename = singleMatch.filename || singleMatch.name;
          setActiveFolderStep('sync', `Uploading "${filename}" to Moellim General...`);
          await featureService.confirmDetectedOutline(course, filename);
          await load(true);
          setSessionStatus(old => ({ ...old, outline: true }));
          setMessage(
            `Folder saved. Course outline "${filename}" detected from the restricted folder and uploaded to Moellim General.`
          );
          addToast(
            'success',
            'Course outline uploaded',
            'MUAWIN detected the outline in your restricted folder and uploaded it to Moellim General.'
          );
        } else if (found.length > 1) {
          setMessage(
            outline?.message ||
              'Folder saved, but multiple possible outlines were found in the restricted folder. No outline was uploaded.'
          );
          addToast(
            'success',
            'Folder saved',
            'No outline was uploaded because the folder contains multiple possible outlines.'
          );
        } else {
          setMessage(
            'Folder saved, but no valid course outline was found in the restricted folder.'
          );
          addToast(
            'success',
            'Folder saved',
            'No valid course outline was found in the selected folder.'
          );
        }
      } else if (outline?.status === 'uploaded') {
        setSessionStatus(old => ({ ...old, outline: true }));
        setMessage(
          `Folder saved. Course outline "${outline.filename || ''}" was automatically uploaded to Moellim General.`
        );
        addToast(
          'success',
          'Course outline uploaded',
          'MUAWIN detected the outline and uploaded it to Moellim General.'
        );
      } else if (outline?.status === 'not_found') {
        setMessage(
          outline.message ||
            'Folder saved, but no valid course outline was found in the restricted folder. No document was uploaded.'
        );
        addToast(
          'success',
          'Folder saved',
          'No valid course outline was found in the selected folder.'
        );
      } else if (outline?.status === 'failed') {
        setMessage(outline.message || 'Folder saved, but automatic outline upload failed.');
      } else {
        setMessage(
          res.data?.message ||
            'Folder saved. MUAWIN will use only this folder for course-file detection.'
        );
        addToast('success', 'Folder saved', 'MUAWIN will only scan this selected folder.');
      }

      completeAllFolderSteps();
    } catch (e: any) {
      window.clearTimeout(scanTimer);
      window.clearTimeout(verifyTimer);
      window.clearTimeout(syncTimer);
      setMessage(e.message || 'Could not save folder.');
    } finally {
      window.clearTimeout(scanTimer);
      window.clearTimeout(verifyTimer);
      window.clearTimeout(syncTimer);
      setLoading(false);
      setFolderProcessing(false);
    }
  };

  const handleClearFolder = async () => {
    if (!course || loading) return;
    setLoading(true);
    setMessage('');
    try {
      await featureService.saveFolder(course, '');
      setFolderPath('');
      setCandidates([]);
      await load(true);
      setMessage(
        'Saved lecture folder cleared. Select a folder before scanning or uploading lectures.'
      );
      addToast(
        'success',
        'Lecture folder cleared',
        'No local folder is currently selected for this course.'
      );
    } catch (e: any) {
      setMessage(e.message || 'Could not clear folder.');
    } finally {
      setLoading(false);
    }
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
      setCandidates(old => old.map(c => (c.id === id ? { ...c, status: 'confirmed' } : c)));
      addToast(
        'success',
        'File confirmed',
        'This candidate is marked as teacher-confirmed. It has not been uploaded.'
      );
    } catch (e: any) {
      setMessage(e.message || 'Could not confirm candidate.');
    }
  };

  if (!course) {
    return (
      <div className="p-8 bg-white rounded-2xl border text-slate-600">
        Select a Moellim course before configuring its folder and class schedule.
      </div>
    );
  }

  const renderProcessingCard = (title: string, steps: ProcessingStep[]) => (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <p className="text-sm font-semibold text-blue-950">{title}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {steps.map(step => (
          <div
            key={step.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              step.status === 'done'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800'
                : step.status === 'active'
                ? 'bg-white border-blue-300 text-blue-900 shadow-xs'
                : 'bg-white/60 border-slate-200/80 text-slate-400'
            }`}
          >
            {step.status === 'done' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : step.status === 'active' ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
            )}
            <span className="truncate">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Configure</h2>
        </div>
      </div>

      {message && !folderProcessing && !scheduleProcessing && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs font-medium text-blue-900">
          {message}
        </div>
      )}

      {hosted && <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="font-bold text-slate-900">Course materials</h2>
        <p className="text-sm text-slate-500">Upload outlines, slides, and assignment files for the selected course.</p>
        <label className="block text-sm font-medium text-slate-700">
          {uploading ? 'Uploading materials…' : 'Choose course files'}
          <input type="file" multiple disabled={uploading || !selectedCourse}
            accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.csv,.xlsx" className="mt-2 block w-full text-sm"
            onChange={async event => {
              const input = event.currentTarget;
              const files = Array.from(input.files || []);
              if (!files.length || !selectedCourse) return;
              setUploading(true);
              try {
                for (const file of files) {
                  if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('Choose files between 1 byte and 50 MB.');
                  const request = { course_id: selectedCourse.id, file_name: file.name };
                  const { data: upload } = await api.post<{ object_key: string; upload_url: string }>('/materials/upload-url', request);
                  const response = await fetch(upload.upload_url, { method: 'PUT', body: file,
                    headers: { 'Content-Type': file.type || 'application/octet-stream' } });
                  if (!response.ok) throw new Error('Upload failed for ' + file.name);
                  const { data } = await api.post<{folder_path: string}>('/materials/confirm',
                    { ...request, object_key: upload.object_key });
                  setSavedFolderPath(data.folder_path);
                  setFolderPath(data.folder_path);
                }
                setMessage('Uploaded ' + files.map(file => file.name).join(', '));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Upload failed.');
              } finally {
                setUploading(false);
                input.value = '';
              }
            }} />
        </label>
      </section>}
      {!hosted && <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
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
            disabled={folderProcessing}
            placeholder="C:\Users\...\Course Lectures"
            className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50"
          />
          <div className="flex flex-wrap sm:flex-nowrap gap-2.5 shrink-0">
            <button
              onClick={handleFolder}
              disabled={
                loading ||
                !folderPath.trim() ||
                folderPath.trim() === savedFolderPath.trim()
              }
              className={`flex-1 sm:flex-none whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                folderProcessing
                  ? 'bg-blue-600 text-white border border-blue-600 opacity-90'
                  : folderPath.trim() && folderPath.trim() !== savedFolderPath.trim()
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 cursor-pointer'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 cursor-default'
              }`}
            >
              {folderProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
              {folderProcessing
                ? 'Processing...'
                : folderPath.trim() && folderPath.trim() === savedFolderPath.trim()
                ? 'Folder Saved'
                : 'Save Folder'}
            </button>
            <button
              onClick={handleScan}
              disabled={
                loading ||
                !savedFolderPath.trim() ||
                folderPath.trim() !== savedFolderPath.trim()
              }
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

        {folderProcessing && renderProcessingCard(folderProcessingTitle, folderSteps)}

        {candidates.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {candidates.map(c => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 truncate">{c.path}</p>
                </div>
                {c.status === 'confirmed' ? (
                  <span className="text-xs font-bold text-emerald-700">Teacher confirmed</span>
                ) : (
                  <button
                    onClick={() => handleConfirmCandidate(c.id)}
                    className="text-xs font-semibold text-blue-700 cursor-pointer"
                  >
                    Confirm candidate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="text-blue-600" />
          <div>
            <h2 className="font-bold text-slate-900">Class Days & Timings</h2>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-800">
            Class sessions ({classSlots.length})
          </h3>
          <button
            onClick={addClassSlot}
            disabled={scheduleProcessing}
            className="text-sm font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-40 cursor-pointer"
          >
            + Add class session
          </button>
        </div>

        <div className="space-y-3">
          {classSlots.map((slot, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end"
            >
              <label className="block text-xs font-medium text-slate-500">
                Day
                <select
                  value={slot.weekday}
                  disabled={scheduleProcessing}
                  onChange={e => updateClassSlot(i, 'weekday', Number(e.target.value))}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-blue-600 disabled:bg-slate-50"
                >
                  {[
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                    'Sunday',
                  ].map((day, d) => (
                    <option key={day} value={d}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-500">
                Start
                <input
                  type="time"
                  value={slot.start_time}
                  disabled={scheduleProcessing}
                  onChange={e => updateClassSlot(i, 'start_time', e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:outline-blue-600 disabled:bg-slate-50"
                />
              </label>

              <label className="block text-xs font-medium text-slate-500">
                End
                <input
                  type="time"
                  value={slot.end_time}
                  disabled={scheduleProcessing}
                  onChange={e => updateClassSlot(i, 'end_time', e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:outline-blue-600 disabled:bg-slate-50"
                />
              </label>

              <button
                type="button"
                disabled={scheduleProcessing}
                onClick={() => setClassSlots(old => old.filter((_, j) => j !== i))}
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors cursor-pointer justify-self-end sm:justify-self-auto"
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
          className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-colors cursor-pointer inline-flex items-center gap-2"
        >
          {scheduleProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
          {scheduleProcessing ? 'Uploading Schedule...' : 'Save Class Schedule'}
        </button>

        {scheduleProcessing && renderProcessingCard(scheduleProcessingTitle, scheduleSteps)}
      </section>

      <div className="flex justify-end">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-slate-500 cursor-pointer"
        >
          <RefreshCw size={15} /> Refresh status
        </button>
      </div>
    </div>
  );
};
