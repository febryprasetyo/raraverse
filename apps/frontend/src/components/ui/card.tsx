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
      className={`rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[0_6px_24px_rgba(15,23,42,0.04)] transition-shadow duration-200 hover:shadow-[0_10px_30px_rgba(15,23,42,0.07)] ${className}`}
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
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
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
