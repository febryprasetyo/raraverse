import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
