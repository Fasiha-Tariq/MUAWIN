import React from 'react';
import { LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  icon: LucideIcon;
  variant: 'primary' | 'accent' | 'secondary';
  onClick: () => void;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
  title,
  description,
  buttonLabel,
  icon: Icon,
  variant,
  onClick
}) => {
    const styles = {
    primary: {
      card: 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300 shadow-sm text-slate-900',
      iconBox: 'bg-blue-100 text-blue-700 border border-blue-200',
      button: 'bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-xs',
      textMuted: 'text-slate-600'
    },
    accent: {
      card: 'bg-violet-50 border-violet-200 hover:bg-violet-100 hover:border-violet-300 shadow-sm text-slate-900',
      iconBox: 'bg-violet-100 text-violet-700 border border-violet-200',
      button: 'bg-violet-600 text-white hover:bg-violet-700 font-semibold shadow-xs',
      textMuted: 'text-slate-600'
    },
    secondary: {
      card: 'bg-teal-50 border-teal-200 hover:bg-teal-100 hover:border-teal-300 shadow-sm text-slate-900',
      iconBox: 'bg-teal-100 text-teal-700 border border-teal-200',
      button: 'bg-teal-600 text-white hover:bg-teal-700 font-semibold shadow-xs',
      textMuted: 'text-slate-600'
    }
  }[variant];

  return (
    <div className={`rounded-2xl p-5 border transition-all duration-150 flex flex-col justify-between ${styles.card}`}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${styles.iconBox}`}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">
            {variant === 'primary' ? 'Interactive AI' : variant === 'accent' ? 'Real-Time' : 'Supervisor'}
          </span>
        </div>
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        <p className={`text-xs mt-1.5 leading-relaxed ${styles.textMuted}`}>{description}</p>
      </div>

      <div className="mt-5 pt-3 border-t border-current/10">
        <button
          onClick={onClick}
          className={`w-full py-2.5 px-4 text-xs rounded-xl flex items-center justify-center gap-2 transition-colors ${styles.button}`}
        >
          <span>{buttonLabel}</span>
        </button>
      </div>
    </div>
  );
};
