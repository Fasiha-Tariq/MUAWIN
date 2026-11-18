import React from 'react';
import { LectureSessionData, DetectedAction } from '../../types';
import { 
  Sparkles, 
  Lightbulb, 
  AlertTriangle, 
  ArrowRight, 
  Tag, 
  ListChecks, 
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

interface LectureInsightsPanelProps {
  session: LectureSessionData;
  onReviewAction: (action: DetectedAction) => void;
}

export const LectureInsightsPanel: React.FC<LectureInsightsPanelProps> = ({
  session,
  onReviewAction
}) => {
  const navigate = useNavigate();
  const { addWorkflow } = useApp();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">Lecture Insights</h3>
        </div>
        <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
          Real-Time LLM Analysis
        </span>
      </div>

      {/* Topics Section */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-blue-600" />
          <span>Extracted Topics ({session.extractedTopics.length})</span>
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {session.extractedTopics.map((topic, i) => (
            <span
              key={i}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/80"
            >
              • {topic}
            </span>
          ))}
        </div>
      </div>

      {/* Key Points Section */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5 text-emerald-600" />
          <span>Key Points ({session.keyPoints.length})</span>
        </h4>
        <ul className="space-y-2 text-xs text-slate-700">
          {session.keyPoints.map((point, idx) => (
            <li key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Detected Actions Section */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Detected Actions ({session.detectedActions.length})</span>
        </h4>

        <div className="space-y-3">
          {session.detectedActions.map((action) => (
            <div
              key={action.id}
              className="p-3.5 rounded-xl border border-amber-200/90 bg-amber-50/60 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{action.type} Mentioned</span>
                </span>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                  {Math.round(action.confidence * 100)}% Confidence
                </span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 block">Topic:</span>
                <span className="text-xs font-semibold text-slate-900 block">{action.topic}</span>
              </div>

              {action.dueDateCandidate && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Possible Due Date: <strong>{action.dueDateCandidate}</strong></span>
                </div>
              )}

              <p className="text-[11px] text-slate-600 leading-relaxed italic">
                "{action.description}"
              </p>

              <div className="pt-2 border-t border-amber-200/60 flex justify-end">
                <button
                  onClick={() => onReviewAction(action)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>Review Action</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
