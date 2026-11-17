import { FRONTEND_ROUTES } from './index';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-slate-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          ebieshop Control Plane
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Affiliate Automation Dashboard
        </h1>
        <p className="text-sm text-slate-300">
          Fondasi Next.js App Router + Tailwind CSS siap. Modul halaman Phase 3 akan terhubung ke{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-300">
            @ebieshop/backend
          </code>
          .
        </p>
      </header>

      <section aria-labelledby="routes-heading" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 id="routes-heading" className="sr-only">
          Daftar Rute Aplikasi
        </h2>
        {FRONTEND_ROUTES.map((route) => (
          <div
            key={route}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition-colors hover:border-slate-700"
          >
            <p className="font-mono text-sm font-semibold text-emerald-400">{route}</p>
            <p className="mt-1 text-xs text-slate-400">
              {route === '/' ? 'Dashboard Overview (Aktif)' : 'Terjadwal di Phase 3'}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
