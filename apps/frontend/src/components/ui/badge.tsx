import type { ReactNode } from 'react';

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}

const TONE_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral:
    'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-200',
  danger:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/60 dark:text-rose-200',
  info:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/60 dark:text-indigo-200',
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
