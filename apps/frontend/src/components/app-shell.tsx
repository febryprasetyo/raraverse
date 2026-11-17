'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CalendarClock,
  Film,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from './ui/button';

export const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/products', label: 'Produk & Kampanye', icon: Package },
  { href: '/studio', label: 'Content Studio', icon: Film },
  { href: '/scheduler', label: 'Scheduler & DM', icon: CalendarClock },
  { href: '/health', label: 'System Health', icon: Activity },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { token, isReady, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('ebieshop_theme');
      const isDark = saved === 'dark';
      setDarkMode(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    } catch {
      // Ignore storage errors
    }
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem('ebieshop_theme', next ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (pathname === '/login') {
    return <main id="main-content">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lewati ke konten utama
      </a>

      {/* Desktop Sidebar */}
      <aside
        aria-label="Sidebar Navigasi"
        className="hidden w-60 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] md:flex"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white dark:bg-emerald-600">
              E
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                EBIESHOP
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">creator affiliate</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            {darkMode ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <nav aria-label="Menu Utama" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Workspace
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? pathname === '/' || pathname === '/analytics'
                : item.href === '/scheduler'
                  ? pathname === '/scheduler' || pathname === '/dm-logs'
                  : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                  active
                    ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60 hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border-hairline)] p-3">
          {isReady && token ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={logout}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Keluar Sesi
            </Button>
          ) : (
            <Link
              href="/login"
              className="block rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
            >
              Masuk Admin
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white dark:bg-emerald-600">
              E
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]">EBIESHOP</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              aria-label={drawerOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="rounded-lg border border-[var(--border-hairline)] p-2 text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              {drawerOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {drawerOpen ? (
          <nav
            id="mobile-nav-drawer"
            aria-label="Menu Mobile"
            className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 md:hidden"
          >
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                      active
                        ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        ) : null}

        <main id="main-content" className="relative flex-1 overflow-x-hidden">
          <div
            aria-hidden="true"
            className="ebie-hero-aura pointer-events-none absolute inset-x-0 top-0 h-64"
          />
          <div className="relative p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
