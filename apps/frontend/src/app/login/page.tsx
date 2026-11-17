'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { createBackendClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
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
        baseUrl: DEFAULT_API_BASE,
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader
          title="Masuk Admin ebieshop"
          subtitle="Masukkan Admin Bearer Token (ADMIN_JWT_SECRET) untuk mengelola pipeline."
        />
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor="admin-token-input"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
            >
              Admin Bearer Token
            </label>
            <input
              id="admin-token-input"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="dev-admin-jwt-secret-minimum-32-chars"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              required
            />
          </div>

          {errorMsg ? (
            <p role="alert" className="text-xs font-medium text-rose-400">
              {errorMsg}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Memverifikasi Token...' : 'Masuk ke Dashboard'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
