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
      card: 'bg-gradient-to-br from-blue-700 to-blue-900 text-white border-blue-800 shadow-md shadow-blue-950/10',
      iconBox: 'bg-white/10 text-white',
      button: 'bg-white text-blue-900 hover:bg-blue-50 active:bg-blue-100 font-semibold shadow-xs',
      textMuted: 'text-blue-100'
    },
    accent: {
      card: 'bg-white border-slate-200 hover:border-slate-300 shadow-sm text-slate-900',
      iconBox: 'bg-rose-50 text-rose-600 border border-rose-100',
      button: 'bg-slate-900 text-white hover:bg-slate-800 font-semibold shadow-xs',
      textMuted: 'text-slate-600'
    },
    secondary: {
      card: 'bg-white border-slate-200 hover:border-slate-300 shadow-sm text-slate-900',
      iconBox: 'bg-amber-50 text-amber-600 border border-amber-100',
      button: 'bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-xs',
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
