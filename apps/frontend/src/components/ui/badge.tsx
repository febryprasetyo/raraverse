import type { ReactNode } from 'react';

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

const TONE_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'border-slate-700 bg-slate-800/90 text-slate-200',
  success: 'border-emerald-700/80 bg-emerald-950/75 text-emerald-300',
  warning: 'border-amber-700/80 bg-amber-950/75 text-amber-200',
  danger: 'border-rose-700/80 bg-rose-950/75 text-rose-200',
  info: 'border-sky-700/80 bg-sky-950/75 text-sky-200',
  violet: 'border-violet-700/80 bg-violet-950/75 text-violet-200',
};

const DOT_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  info: 'bg-sky-400',
  violet: 'bg-violet-400',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  className = '',
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot ? (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
