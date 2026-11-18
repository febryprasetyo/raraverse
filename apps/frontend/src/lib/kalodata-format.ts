export function formatCompactIdr(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }
  if (value >= 1_000_000_000) {
    return `Rp${(value / 1_000_000_000).toFixed(2).replace('.', ',')}M`;
  }
  if (value >= 1_000_000) {
    return `Rp${(value / 1_000_000).toFixed(2).replace('.', ',')}JT`;
  }
  if (value >= 1_000) {
    return `Rp${(value / 1_000).toFixed(2).replace('.', ',')}RB`;
  }
  return `Rp${Math.round(value).toLocaleString('id-ID')}`;
}

export function formatExactIdr(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }
  const hasFraction = Math.abs(value - Math.round(value)) >= 0.005;
  return `Rp${new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function formatCompactCount(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2).replace('.', ',')}JT`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2).replace('.', ',')}RB`;
  }
  return value.toLocaleString('id-ID');
}

export function formatSignedPct(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2).replace('.', ',')}%`;
}

export function formatRatioPct(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${value.toFixed(2).replace('.', ',')}%`;
}

export function computeChannelMix(
  liveRevenue?: number,
  videoRevenue?: number,
  showcaseRevenue?: number
) {
  const live =
    typeof liveRevenue === 'number' && Number.isFinite(liveRevenue)
      ? Math.max(0, liveRevenue)
      : 0;
  const video =
    typeof videoRevenue === 'number' && Number.isFinite(videoRevenue)
      ? Math.max(0, videoRevenue)
      : 0;
  const showcase =
    typeof showcaseRevenue === 'number' && Number.isFinite(showcaseRevenue)
      ? Math.max(0, showcaseRevenue)
      : 0;
  const total = live + video + showcase;

  if (total <= 0) {
    return { live, video, showcase, total: 0, livePct: 0, videoPct: 0, showcasePct: 0 };
  }

  return {
    live,
    video,
    showcase,
    total,
    livePct: Math.round((live / total) * 100),
    videoPct: Math.round((video / total) * 100),
    showcasePct: Math.round((showcase / total) * 100),
  };
}
