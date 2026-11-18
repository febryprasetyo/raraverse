import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './button';

export interface StatePanelProps {
  status: 'loading' | 'empty' | 'error';
  title: string;
  description?: string;
  onRetry?: () => void;
}

export function StatePanel({ status, title, description, onRetry }: StatePanelProps) {
  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-12 text-center"
      >
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden="true" />
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {description ? (
          <p className="text-xs text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-500/40 bg-rose-950/35 px-6 py-10 text-center"
      >
        <AlertCircle className="h-5 w-5 text-rose-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-rose-200">{title}</p>
        {description ? (
          <p className="text-xs text-rose-300">{description}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Coba Lagi
            </Button>
          ) : null}
          {description?.includes('401') ? (
            <a
              href="/login"
              onClick={() => {
                try {
                  window.localStorage.removeItem('ebieshop_admin_token');
                } catch {
                  // Ignore storage errors
                }
              }}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Masuk Ulang (Reset Token)
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-12 text-center">
      <Inbox className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="text-xs text-[var(--text-muted)]">{description}</p>
      ) : null}
    </div>
  );
}
