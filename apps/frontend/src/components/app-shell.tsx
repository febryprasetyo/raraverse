'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  CalendarClock,
  Film,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from './ui/button';

export const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/products', label: 'Produk & Kalodata', icon: Package },
  { href: '/studio', label: 'Content Studio 9:16', icon: Film },
  { href: '/scheduler', label: 'Scheduler & Queue', icon: CalendarClock },
  { href: '/dm-logs', label: 'Meta Auto-DM Logs', icon: MessageSquareText },
  { href: '/health', label: 'Worker & OAuth Health', icon: Activity },
  { href: '/analytics', label: 'Sunday Evaluation', icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { token, isReady, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lewati ke konten utama
      </a>

      {/* Desktop Sidebar */}
      <aside
        aria-label="Sidebar Navigasi"
        className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 md:flex"
      >
        <div className="border-b border-slate-800 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            ebieshop
          </p>
          <p className="mt-1 text-base font-bold text-white">Affiliate Control</p>
        </div>

        <nav aria-label="Menu Utama" className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  active
                    ? 'bg-emerald-600/20 text-emerald-300'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          {isReady && token ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Keluar Sesi
            </Button>
          ) : (
            <Link
              href="/login"
              className="block rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Masuk Admin
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 md:hidden">
          <span className="text-sm font-bold text-white">ebieshop Control</span>
          <button
            type="button"
            aria-label={drawerOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {drawerOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </header>

        {/* Mobile Drawer */}
        {drawerOpen ? (
          <nav
            id="mobile-nav-drawer"
            aria-label="Menu Mobile"
            className="border-b border-slate-800 bg-slate-900 p-3 md:hidden"
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
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      active
                        ? 'bg-emerald-600/20 text-emerald-300'
                        : 'text-slate-300 hover:bg-slate-800'
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

        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
