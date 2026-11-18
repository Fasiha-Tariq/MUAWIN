import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { featureService } from '../services/featureService';

export const Timetable: React.FC = () => {
  const { courses, selectedCourse, selectCourse }=useApp();
  const course=selectedCourse?.title||selectedCourse?.code||'';
  const [setup,setSetup]=useState<any>(null);
  const [readiness,setReadiness]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;(async()=>{if(!course)return;setLoading(true);setError('');try{const r=await featureService.setup(course);if(active){setSetup(r.data.setup);setReadiness(r.data.readiness);}}catch(e:any){if(active)setError(e.message||'Could not load timetable.');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[course]);
  const weeks=setup?.timetable?.weeks||[];
  return <div className="max-w-5xl mx-auto space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Academic plan</p><h1 className="text-2xl font-extrabold text-slate-900 mt-1">Timetable</h1><p className="text-sm text-slate-500 mt-1">Confirmed week-by-week teaching plan for your selected Moellim course.</p></div><select value={selectedCourse?.id||''} onChange={e=>selectCourse(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
    {error&&<div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><CalendarDays/></div><div><h2 className="font-bold text-slate-900">Teacher-confirmed timetable</h2><p className="text-xs text-slate-500">{readiness?.timetable_ready?'Confirmed and saved':'No confirmed timetable yet'}</p></div></div><Link to="/setup" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open Course Setup <ArrowRight size={15}/></Link></div>
    {!weeks.length&&!loading&&<div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><AlertCircle className="mx-auto text-amber-500" size={30}/><h3 className="font-bold text-slate-800 mt-3">Timetable not configured</h3><p className="text-sm text-slate-500 mt-1">Import a timetable and confirm the extracted weekly topics in Course Setup.</p><Link to="/setup" className="inline-flex mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Configure timetable</Link></div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{weeks.map((w:any)=><div key={w.week} className="bg-white border border-slate-200 rounded-xl p-4"><div className="flex justify-between items-center"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Week {w.week}</p><CheckCircle2 size={17} className="text-emerald-500"/></div><h3 className="font-semibold text-slate-900 mt-2">{w.topic||'Topic to be confirmed'}</h3>{w.due_date&&<p className="text-xs text-slate-500 mt-2">Target date: {w.due_date}</p>}</div>)}</div>
  </div>;
};
