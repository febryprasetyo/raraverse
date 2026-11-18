'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { StatePanel } from './ui/state-panel';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { token, isReady } = useAuth();

  if (!isReady) {
    return (
      <StatePanel
        status="loading"
        title="Memeriksa sesi admin..."
        description="Mohon tunggu sebentar."
      />
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center shadow-sm">
        <h1 className="text-base font-bold text-[var(--text-primary)]">
          Autentikasi Admin Diperlukan
        </h1>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Silakan masuk dengan token admin backend untuk mengakses dashboard EBIESHOP.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          Buka Halaman Login
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
