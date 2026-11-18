import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideIcon, ArrowLeft, Layers, CheckCircle2, Clock } from 'lucide-react';
import { Button } from './Button';

export interface PlaceholderPageProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  phase?: string;
  description: string;
  plannedFeatures: string[];
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  subtitle,
  icon: Icon,
  phase = 'Phase 2',
  description,
  plannedFeatures
}) => {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 md:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {title}
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  {phase}: Next Phase
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">{subtitle}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard')}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Back to Dashboard
          </Button>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs md:text-sm text-slate-600 leading-relaxed max-w-3xl">
            {description}
          </p>
        </div>
      </div>

      {/* Planned Architecture & Capabilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Planned Features List */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Planned Capabilities for Next Phase
            </h3>
          </div>
          <ul className="space-y-3">
            {plannedFeatures.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600">
                <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                  {idx + 1}
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Phase 1 Scope Notice */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Active in Phase 1
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              The foundational MUAWIN design system, user authentication, responsive application shell, navigation routing, and live Teacher Dashboard are fully operational.
            </p>
            <div className="space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Global MUAWIN Design System</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Mock Moellim Teacher Authentication</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Responsive Sidebar & Topbar Shell</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Comprehensive Academic Dashboard</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>MUAWIN — From Intent to Action</span>
            <span>Riphah Moellim FYP</span>
          </div>
        </div>
      </div>
    </div>
  );
};
