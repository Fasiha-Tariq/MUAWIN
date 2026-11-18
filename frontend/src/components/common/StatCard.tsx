import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor?: 'blue' | 'amber' | 'emerald' | 'purple' | 'slate';
  badgeText?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accentColor = 'blue',
  badgeText,
  onClick
}) => {
  const colorMap = {
    blue: {
      bg: 'bg-blue-50/70',
      text: 'text-blue-600',
      border: 'border-blue-100',
      badge: 'bg-blue-100/80 text-blue-700'
    },
    amber: {
      bg: 'bg-amber-50/70',
      text: 'text-amber-600',
      border: 'border-amber-100',
      badge: 'bg-amber-100/80 text-amber-700'
    },
    emerald: {
      bg: 'bg-emerald-50/70',
      text: 'text-emerald-600',
      border: 'border-emerald-100',
      badge: 'bg-emerald-100/80 text-emerald-700'
    },
    purple: {
      bg: 'bg-purple-50/70',
      text: 'text-purple-600',
      border: 'border-purple-100',
      badge: 'bg-purple-100/80 text-purple-700'
    },
    slate: {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      badge: 'bg-slate-200 text-slate-700'
    }
  };

  const scheme = colorMap[accentColor];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-5 border border-slate-200/90 shadow-sm transition-all duration-150 ${
        onClick ? 'cursor-pointer hover:border-slate-300 hover:shadow' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{title}</span>
        <div className={`p-2.5 rounded-lg ${scheme.bg} ${scheme.text}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-3xl font-bold text-slate-900 tracking-tight">{value}</span>
        {badgeText && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${scheme.badge}`}>
            {badgeText}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1.5 leading-snug">{subtitle}</p>
      )}
    </div>
  );
};
