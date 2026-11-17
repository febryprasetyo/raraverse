import type { ReactNode } from 'react';

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}

const TONE_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'border-slate-700 bg-slate-800 text-slate-200',
  success: 'border-emerald-700/60 bg-emerald-950/70 text-emerald-300',
  warning: 'border-amber-700/60 bg-amber-950/70 text-amber-200',
  danger: 'border-rose-700/60 bg-rose-950/70 text-rose-200',
  info: 'border-sky-700/60 bg-sky-950/70 text-sky-200',
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
