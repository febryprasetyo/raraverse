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

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const curr = points[i]!;
    const next = points[i + 1]!;
    const midX = (curr.x + next.x) / 2;
    path += ` C ${midX} ${curr.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
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
  const height = 230;
  const padLeft = 18;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 30;
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

  const revCoords = series.map((p, i) => ({ x: getX(i), y: getRevY(p.revenueIdr) }));
  const clickCoords = series.map((p, i) => ({ x: getX(i), y: getClickY(p.clicks) }));

  const revPath = buildSmoothPath(revCoords);
  const clickPath = buildSmoothPath(clickCoords);
  const revAreaPath =
    revCoords.length > 0
      ? `${revPath} L ${revCoords.at(-1)!.x} ${padTop + plotH} L ${revCoords[0]!.x} ${padTop + plotH} Z`
      : '';

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
    link.download = `ebieshop-performance-${rangeLabel.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="lg:col-span-8">
      <CardHeader
        title="Tren Estimasi Komisi & Klik"
        subtitle={`Periode ${rangeLabel} — arahkan kursor ke kurva untuk rincian harian`}
        action={
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 text-[11px] text-[var(--text-muted)] sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Komisi
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Klik
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExportCsv}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              CSV
            </Button>
          </div>
        }
      />

      {activePoint ? (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-[var(--bg-subtle)]/80 px-3.5 py-2.5 text-xs">
          <span className="font-semibold text-[var(--text-primary)]">
            {activePoint.label}
          </span>
          <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
            Est. Komisi: Rp{activePoint.revenueIdr.toLocaleString('id-ID')}
          </span>
          <span className="tabular-nums font-medium text-indigo-700 dark:text-indigo-300">
            Est. Klik: {activePoint.clicks.toLocaleString('id-ID')}
          </span>
          <span className="tabular-nums text-[var(--text-secondary)]">
            Est. Konversi: {activePoint.conversions}
          </span>
        </div>
      ) : null}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Grafik kurva halus estimasi komisi dan klik affiliate"
          className="h-60 w-full min-w-[460px]"
        >
          <defs>
            <linearGradient id="ebieAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
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
                className="text-slate-800"
                strokeDasharray="4 4"
              />
            );
          })}

          {revAreaPath ? <path d={revAreaPath} fill="url(#ebieAreaGrad)" /> : null}
          {revPath ? (
            <path
              d={revPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ) : null}
          {clickPath ? (
            <path
              d={clickPath}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          ) : null}

          {series.map((point, idx) => {
            const cx = getX(idx);
            const cy = getRevY(point.revenueIdr);
            return (
              <g key={point.label}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={hoveredIdx === idx ? 5.5 : 3.2}
                  className="fill-emerald-600 stroke-white transition-all dark:stroke-slate-900"
                  strokeWidth="2"
                />
                <rect
                  x={cx - 22}
                  y={padTop}
                  width={44}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                <text
                  x={cx}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-[var(--text-muted)] text-[10px] font-medium"
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
