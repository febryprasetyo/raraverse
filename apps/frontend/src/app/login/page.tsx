'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { createBackendClient, resolveApiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    if (trimmed.length < 16) {
      setErrorMsg('Token admin minimal 16 karakter (sesuai ADMIN_JWT_SECRET).');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const client = createBackendClient({
        baseUrl: resolveApiBaseUrl(),
        token: trimmed,
      });
      await client.listProducts();
      login(trimmed);
      router.push('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('401')) {
        setErrorMsg(
          'Token admin tidak valid (401). Pastikan sesuai dengan ADMIN_JWT_SECRET di backend.'
        );
      } else {
        setErrorMsg(
          `Gagal menghubungi backend (${msg || 'periksa apakah backend berjalan'}).`
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] px-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-emerald-600">
            E
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">EBIESHOP</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Creator Affiliate Control
            </p>
          </div>
        </div>
        <CardHeader
          title="Masuk ke Dashboard"
          subtitle="Masukkan Admin Bearer Token dari konfigurasi backend untuk membuka kontrol kreator."
        />
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor="admin-token-input"
              className="block text-xs font-semibold text-[var(--text-secondary)]"
            >
              Admin Bearer Token
            </label>
            <div className="relative mt-1.5">
              <input
                id="admin-token-input"
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Masukkan minimal 16 karakter token admin"
                aria-describedby="admin-token-help"
                aria-invalid={Boolean(errorMsg)}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2 pl-3 pr-11 text-sm text-[var(--text-primary)] placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                required
              />
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                aria-label={showToken ? 'Sembunyikan token' : 'Tampilkan token'}
                className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-xl text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p id="admin-token-help" className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Sesuai dengan nilai <code className="font-mono text-slate-300">ADMIN_JWT_SECRET</code> pada environment backend.
            </p>
          </div>

          {errorMsg ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-950/35 px-3 py-2 text-xs font-medium text-rose-200"
            >
              {errorMsg}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Memverifikasi Token...' : 'Masuk ke Dashboard'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
