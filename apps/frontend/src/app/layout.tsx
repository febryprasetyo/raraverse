import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Revenlo × ebieshop — Affiliate Analytics & Automation',
  description:
    'Pusat kendali analitik afiliasi, performa tautan kampanye, kurasi produk, studio konten 9:16, dan pencairan komisi.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
