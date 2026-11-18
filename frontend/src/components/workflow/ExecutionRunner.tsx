import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkflowItem } from '../../types';
import { 
  CheckCircle2, 
  RefreshCw, 
  Circle, 
  ShieldCheck, 
  ExternalLink, 
  ArrowRight,
  LayoutDashboard,
  Clock,
  Laptop
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EXECUTION_STEPS_ASSIGNMENT } from '../../services/workflowService';

interface ExecutionRunnerProps {
  workflow: WorkflowItem;
  onFinish?: () => void;
}

export const ExecutionRunner: React.FC<ExecutionRunnerProps> = ({ workflow, onFinish }) => {
  const navigate = useNavigate();
  const { executeWorkflowDirectly } = useApp();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(workflow.status === 'completed');
  const [logMessages, setLogMessages] = useState<string[]>([
    'Initializing controlled browser session...',
    'Validating teacher authorization token...'
  ]);

  useEffect(() => {
    if (workflow.status === 'completed') {
      setIsCompleted(true);
      setCurrentStep(EXECUTION_STEPS_ASSIGNMENT.length);
      return;
    }

    let isMounted = true;

    const run = async () => {
      await executeWorkflowDirectly(workflow.id, (stepIndex, logMsg) => {
        if (isMounted) {
          setCurrentStep(stepIndex);
          setLogMessages((prev) => [...prev.slice(-6), logMsg]);
        }
      });
      if (isMounted) {
        setIsCompleted(true);
        setCurrentStep(EXECUTION_STEPS_ASSIGNMENT.length);
        if (onFinish) onFinish();
      }
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [workflow.id]);

  const progressPct = Math.min(100, Math.round((currentStep / EXECUTION_STEPS_ASSIGNMENT.length) * 100));

  return (
    <div className="space-y-6">
      {!isCompleted ? (
        <>
          {/* Active Execution Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Executing Workflow</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    MUAWIN is performing the approved actions on Moellim through controlled browser automation.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                {progressPct}% Completed
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full mt-5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Vertical Execution Steps Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5">
              Automated Moellim Execution Pipeline
            </h4>

            <div className="space-y-4">
              {EXECUTION_STEPS_ASSIGNMENT.map((step, idx) => {
                const isStepDone = idx < currentStep;
                const isStepActive = idx === currentStep;
                const isStepPending = idx > currentStep;

                return (
                  <div key={step.id} className="flex items-start gap-4">
                    <div className="shrink-0 mt-0.5">
                      {isStepDone ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      ) : isStepActive ? (
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 border border-slate-300 flex items-center justify-center">
                          <Circle className="w-3 h-3 text-slate-300" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h5 className={`text-xs font-bold break-words ${isStepDone ? 'text-slate-900' : isStepActive ? 'text-blue-700' : 'text-slate-400'}`}>
                          {step.title}
                        </h5>
                        <span className="text-[11px] font-semibold shrink-0">
                          {isStepDone ? (
                            <span className="text-emerald-700">Completed</span>
                          ) : isStepActive ? (
                            <span className="text-blue-700 animate-pulse">In Progress</span>
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 break-words">{step.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Automation Console log */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Session Logs</span>
              <div className="bg-slate-900 text-slate-200 rounded-xl p-3 font-mono text-[11px] space-y-1">
                {logMessages.map((msg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-blue-400 shrink-0">&gt;</span>
                    <span className="break-words line-clamp-1">{msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Execution Completed State */
        <div className="bg-white rounded-2xl border border-emerald-200 p-8 shadow-xs text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <ShieldCheck className="w-9 h-9" />
          </div>

          <div className="max-w-md mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full">
              Controlled Action Verified
            </span>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mt-3">
              Workflow Completed
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              The approved assignment workflow has been completed successfully and verified on Riphah Moellim.
            </p>
          </div>

          {/* Outcome Summary Table */}
          <div className="max-w-lg mx-auto bg-slate-50 rounded-xl border border-slate-200 p-4 text-left grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Course</span>
              <span className="font-bold text-slate-900 mt-0.5 block">{workflow.courseCode} — {workflow.courseName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Action</span>
              <span className="font-bold text-slate-900 mt-0.5 block">{workflow.actionType}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
              <span className="font-bold text-emerald-700 mt-0.5 block flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified on Moellim</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed</span>
              <span className="font-medium text-slate-700 mt-0.5 block">
                {workflow.verificationResult?.verifiedAt || 'Today, Just now'}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <button
              onClick={() => navigate('/logs')}
              className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <span>View Activity Log</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
