'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CalendarClock,
  Film,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

export const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/products', label: 'Produk & Kampanye', icon: Package },
  { href: '/studio', label: 'Content Studio', icon: Film },
  { href: '/gallery', label: 'Galeri Konten', icon: Images },
  { href: '/scheduler', label: 'Scheduler & DM', icon: CalendarClock },
  { href: '/health', label: 'System Health', icon: Activity },
] as const;

export const PRODUCT_SUB_ITEMS = [
  { href: '/products', label: 'Product Discovery' },
  { href: '/products/curation', label: 'Produk Kurasi' },
  { href: '/products/lnkbio', label: 'Lnk.Bio Manager' },
  { href: '/products/threads', label: 'Threads Automation' },
] as const;

function renderProductSubMenu(pathname: string) {
  return (
    <div
      className="ml-4 mt-1 space-y-1 border-l border-slate-800 pl-3"
      role="group"
      aria-label="Submenu Produk & Kampanye"
    >
      {PRODUCT_SUB_ITEMS.map((sub) => {
        const subActive = pathname === sub.href;
        return (
          <Link
            key={sub.href}
            href={sub.href}
            aria-current={subActive ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              subActive
                ? 'border border-emerald-500/30 bg-teal-950/80 text-emerald-300'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                subActive ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
              aria-hidden="true"
            />
            <span className="truncate">{sub.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { token, isReady, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lewati ke konten utama
      </a>

      {/* Revenlo-style Sleek Desktop Sidebar */}
      <aside
        aria-label="Sidebar Navigasi"
        className="hidden w-[256px] shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-5 md:flex"
      >
        {/* Brand Header */}
        <div className="mb-6 flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm">
              E
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
                EBIESHOP
              </p>
              <p className="text-[11px] font-medium text-[var(--text-muted)]">
                Creator Studio
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav aria-label="Menu Utama" className="flex-1 space-y-1.5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Main Menu
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? pathname === '/' || pathname === '/analytics'
                : item.href === '/products'
                  ? pathname === '/products' || pathname.startsWith('/products/')
                  : item.href === '/scheduler'
                    ? pathname === '/scheduler' || pathname === '/dm-logs'
                    : pathname === item.href;
            return (
              <Fragment key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    active
                      ? 'bg-emerald-600 text-white shadow-[0_6px_16px_rgba(5,150,105,0.28)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active
                        ? 'text-white'
                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
                {item.href === '/products' ? renderProductSubMenu(pathname) : null}
              </Fragment>
            );
          })}
        </nav>

        {/* Bottom Creator Session Card */}
        <div className="mt-6 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-950 text-xs font-bold text-emerald-300">
              KA
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                Konten Kreator
              </p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">
                Affiliate Mode
              </p>
            </div>
          </div>

          {isReady && token ? (
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Keluar Sesi
            </button>
          ) : (
            <Link
              href="/login"
              className="block rounded-xl bg-emerald-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-emerald-500"
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
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white">
              E
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]">EBIESHOP</span>
          </div>
          <div className="flex items-center gap-1">
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
                const active =
                  item.href === '/products'
                    ? pathname === '/products' || pathname.startsWith('/products/')
                    : pathname === item.href;
                return (
                  <Fragment key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium ${
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                    {item.href === '/products' ? renderProductSubMenu(pathname) : null}
                  </Fragment>
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
