'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';

export interface PerformancePoint {
  label: string;
  revenueIdr: number;
  clicks: number;
  conversions: number;
}

export function PerformanceChart({
  series,
  rangeLabel,
}: {
  series: PerformancePoint[];
  rangeLabel: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 680;
  const height = 220;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxRev = Math.max(1, ...series.map((p) => p.revenueIdr));
  const maxClicks = Math.max(1, ...series.map((p) => p.clicks));

  const getX = (idx: number) =>
    series.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (idx / (series.length - 1)) * plotW;

  const getRevY = (val: number) => padTop + plotH - (val / maxRev) * plotH;
  const getClickY = (val: number) => padTop + plotH - (val / maxClicks) * plotH;

  const revLinePoints = series.map((p, i) => `${getX(i)},${getRevY(p.revenueIdr)}`).join(' ');
  const clickLinePoints = series.map((p, i) => `${getX(i)},${getClickY(p.clicks)}`).join(' ');
  const revAreaPoints = `${padLeft},${padTop + plotH} ${revLinePoints} ${padLeft + plotW},${padTop + plotH}`;

  const activePoint = hoveredIdx !== null ? series[hoveredIdx] : series.at(-1);

  function handleExportCsv() {
    const header = 'Tanggal,Klik,Konversi,Pendapatan_IDR\n';
    const rows = series
      .map((p) => `${p.label},${p.clicks},${p.conversions},${p.revenueIdr}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `revenlo-performance-${rangeLabel.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="lg:col-span-8">
      <CardHeader
        title="Grafik Performa (Pendapatan vs Klik)"
        subtitle={`Periode ${rangeLabel} — arahkan kursor ke titik data untuk rincian`}
        action={
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </Button>
        }
      />

      {activePoint ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs">
          <span className="font-semibold text-[var(--text-primary)]">
            {activePoint.label}
          </span>
          <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
            Pendapatan: Rp{activePoint.revenueIdr.toLocaleString('id-ID')}
          </span>
          <span className="tabular-nums text-indigo-700 dark:text-indigo-300">
            Klik: {activePoint.clicks.toLocaleString('id-ID')}
          </span>
          <span className="tabular-nums text-[var(--text-secondary)]">
            Konversi: {activePoint.conversions}
          </span>
        </div>
      ) : null}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Grafik garis perbandingan pendapatan dan klik afiliasi"
          className="h-56 w-full min-w-[460px]"
        >
          <defs>
            <linearGradient id="revenloRevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75, 1].map((step) => {
            const y = padTop + plotH * (1 - step);
            return (
              <line
                key={step}
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeDasharray="3 3"
              />
            );
          })}

          <polygon points={revAreaPoints} fill="url(#revenloRevGrad)" />
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2.25"
            strokeLinejoin="round"
            points={revLinePoints}
          />
          <polyline
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinejoin="round"
            points={clickLinePoints}
          />

          {series.map((point, idx) => {
            const cx = getX(idx);
            const cy = getRevY(point.revenueIdr);
            return (
              <g key={point.label}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={hoveredIdx === idx ? 5 : 3}
                  className="fill-emerald-600 stroke-white dark:stroke-slate-900"
                  strokeWidth="1.5"
                />
                <rect
                  x={cx - 18}
                  y={padTop}
                  width={36}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-[var(--text-muted)] text-[10px]"
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}
