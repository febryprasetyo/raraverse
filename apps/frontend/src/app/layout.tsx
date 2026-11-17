import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'ebieshop — Affiliate Automation Dashboard',
  description: 'Control plane untuk kurasi produk Kalodata, studio konten 9:16, antrean publish, dan evaluasi mingguan.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
