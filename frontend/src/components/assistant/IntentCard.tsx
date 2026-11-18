import React from 'react';
import { Sparkles, ArrowRight, CheckCircle2, Layers, CheckSquare, ListChecks, ShieldAlert } from 'lucide-react';
import { InterpretationResult } from '../../services/assistantService';

interface IntentCardProps {
  interpretation: InterpretationResult;
  onReviewWorkflow: () => void;
  onSubmitForApproval?: () => void;
  isAlreadyPlanned?: boolean;
}

export const IntentCard: React.FC<IntentCardProps> = ({
  interpretation,
  onReviewWorkflow,
  onSubmitForApproval,
  isAlreadyPlanned = false
}) => {
  return (
    <div className="bg-white rounded-2xl border border-blue-200/90 p-5 sm:p-6 shadow-sm space-y-5">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 tracking-tight block">
              Intent Understanding Stage
            </span>
            <span className="text-[11px] text-slate-500">
              {interpretation.isMultiAction ? 'Compound Multi-Action Directive Detected' : 'Single Action Directive Detected'}
            </span>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Confidence: {Math.round(interpretation.confidence * 100)}%</span>
        </span>
      </div>

      {/* Raw Instruction Quote */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
          Teacher Spoken / Submitted Instruction
        </span>
        <p className="text-xs font-semibold text-slate-900 italic">
          "{interpretation.rawInstruction}"
        </p>
      </div>

      {/* Multi-Action Understanding Breakdown */}
      {interpretation.isMultiAction && interpretation.detectedActionsList && (
        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 space-y-2">
          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-blue-600" />
            <span>MUAWIN Understanding (Multi-Action Decomposition)</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {interpretation.detectedActionsList.map((actionItem, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-blue-200/80 text-xs font-semibold text-slate-800 shadow-2xs">
                <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{actionItem}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context Parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Course Context</span>
          <span className="font-bold text-slate-900 mt-0.5 block">{interpretation.courseCode} — {interpretation.courseName}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Primary Action Intent</span>
          <span className="font-bold text-slate-900 mt-0.5 block">{interpretation.intent}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Source Context</span>
          <span className="font-medium text-slate-700 mt-0.5 block">{interpretation.source}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Moellim Action Scope</span>
          <span className="font-medium text-slate-700 mt-0.5 block">{interpretation.action}</span>
        </div>
      </div>

      {/* Proposed Workflow Sequence Preview */}
      {interpretation.suggestedSteps && interpretation.suggestedSteps.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Proposed Workflow Execution Sequence ({interpretation.suggestedSteps.length} Stages)</span>
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {interpretation.suggestedSteps.map((step, idx) => (
              <div
                key={step.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-slate-800">{step.title}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  step.title.toLowerCase().includes('approval') 
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-slate-200/70 text-slate-600'
                }`}>
                  {step.title.toLowerCase().includes('approval') ? 'Mandatory Gate' : 'Automated'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Human Approval Required Notice */}
      <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50/80 px-3 py-2 rounded-xl border border-amber-200">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          <strong>Supervised Automation:</strong> MUAWIN stages this plan for teacher approval before performing any changes on Moellim.
        </span>
      </div>

      {/* Action Buttons */}
      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5 border-t border-slate-100">
        {onSubmitForApproval && (
          <button
            onClick={onSubmitForApproval}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors text-center cursor-pointer"
          >
            Submit for Approval
          </button>
        )}

        <button
          onClick={onReviewWorkflow}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{isAlreadyPlanned ? 'View Structured Workflow' : 'Review Workflow'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
