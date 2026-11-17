import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  children: ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 focus-visible:ring-slate-900 dark:focus-visible:ring-emerald-400',
  secondary:
    'border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] focus-visible:ring-slate-400',
  danger:
    'bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-500',
  ghost:
    'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:ring-slate-400',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
