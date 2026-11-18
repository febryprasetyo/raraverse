'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  History,
  Link2,
  ListOrdered,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AffiliateLink,
  LnkBioMetricsSnapshot,
  LnkBioOverview,
  LnkBioSyncLog,
} from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface LnkBioManagerProps {
  overview: LnkBioOverview | null;
  logs: LnkBioSyncLog[];
  metrics: LnkBioMetricsSnapshot[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onSync: () => Promise<void>;
  onUpdateLink: (
    productId: string,
    patch: {
      title?: string;
      groupId?: string | null;
      scheduleFrom?: string | null;
      scheduleTo?: string | null;
    }
  ) => Promise<void>;
  onDeleteLink: (productId: string) => Promise<void>;
  onReorder: (orderedProductIds: string[]) => Promise<void>;
}

type ManagerTab = 'links' | 'reorder' | 'analytics';

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function formatDateTimeId(iso: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('id-ID', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function LnkBioManager({
  overview,
  logs,
  metrics,
  loading,
  errorMsg,
  onRetry,
  onSync,
  onUpdateLink,
  onDeleteLink,
  onReorder,
}: LnkBioManagerProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('links');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [groupDraft, setGroupDraft] = useState('');
  const [scheduleFromDraft, setScheduleFromDraft] = useState('');
  const [scheduleToDraft, setScheduleToDraft] = useState('');

  const [confirmDeleteLink, setConfirmDeleteLink] = useState<AffiliateLink | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);

  const activeLinks = useMemo(
    () => (overview?.links ?? []).filter((l) => l.isActive && l.lnkBioId),
    [overview]
  );

  useEffect(() => {
    setDraftOrder(activeLinks.map((l) => l.productId));
  }, [activeLinks]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setEditingLink(null);
        setConfirmDeleteLink(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <StatePanel
        status="loading"
        title="Memuat Lnk.Bio Manager & Analitik Hybrid..."
      />
    );
  }

  if (errorMsg) {
    return (
      <StatePanel
        status="error"
        title="Gagal memuat data Lnk.Bio Manager"
        description={errorMsg}
        onRetry={onRetry}
      />
    );
  }

  if (!overview) {
    return (
      <StatePanel
        status="empty"
        title="Belum ada data integrasi Lnk.Bio"
        description="Hubungkan akun Lnk.Bio Anda untuk memulai otomasi publikasi affiliate."
      />
    );
  }

  const linkByProductId = new Map(activeLinks.map((l) => [l.productId, l]));
  const totalInternalClicks = overview.links.reduce((sum, l) => sum + l.internalClicks, 0);
  const totalLnkBioClicks = overview.links.reduce((sum, l) => sum + l.lnkBioClicks, 0);

  async function runAction(key: string, fn: () => Promise<void>, successMessage: string) {
    setBusyAction(key);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successMessage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Terjadi kesalahan operasi Lnk.Bio');
    } finally {
      setBusyAction(null);
    }
  }

  function openEditDialog(link: AffiliateLink) {
    setEditingLink(link);
    setTitleDraft(link.title);
    setGroupDraft(link.groupId ?? '');
    setScheduleFromDraft(toDatetimeLocalValue(link.scheduleFrom));
    setScheduleToDraft(toDatetimeLocalValue(link.scheduleTo));
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingLink) return;
    const target = editingLink;
    await runAction(
      `edit:${target.productId}`,
      async () => {
        await onUpdateLink(target.productId, {
          title: titleDraft.trim() || target.title,
          groupId: groupDraft.trim() ? groupDraft.trim() : null,
          scheduleFrom: fromDatetimeLocalValue(scheduleFromDraft),
          scheduleTo: fromDatetimeLocalValue(scheduleToDraft),
        });
        setEditingLink(null);
      },
      `Tautan "${titleDraft.trim() || target.title}" berhasil diperbarui di Lnk.Bio.`
    );
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteLink) return;
    const target = confirmDeleteLink;
    await runAction(
      `delete:${target.productId}`,
      async () => {
        await onDeleteLink(target.productId);
        setConfirmDeleteLink(null);
      },
      `Tautan "${target.title}" telah dihapus dari Lnk.Bio.`
    );
  }

  function moveOrderItem(index: number, direction: -1 | 1) {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= draftOrder.length) return;
    const copy = [...draftOrder];
    const current = copy[index]!;
    copy[index] = copy[nextIdx]!;
    copy[nextIdx] = current;
    setDraftOrder(copy);
  }

  return (
    <div className="space-y-6">
      {/* Top Status & KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Tautan Aktif & Siklus Semi-Otomatis"
            subtitle="Auto-Add & Auto-Edit aktif; Delete & Reorder via konfirmasi"
            action={
              <Button
                size="sm"
                variant="primary"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction(
                    'sync',
                    onSync,
                    'Sinkronisasi daftar Lnk.Bio dan snapshot analitik hybrid selesai.'
                  )
                }
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${busyAction === 'sync' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {busyAction === 'sync' ? 'Menyinkronkan...' : 'Sinkronkan Lnk.Bio'}
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">Live di Lnk.Bio</p>
              <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">
                {activeLinks.length}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">Siap Dihapus</p>
              <p className="mt-1 text-xl font-bold text-amber-300">
                {overview.readyToDeleteCount}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Hybrid Click Tracking"
            subtitle="Gabungan Lnk.Bio API & Internal Redirect /r/:code"
          />
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">Klik Internal (/r)</p>
              <p className="mt-1 text-xl font-bold text-emerald-400">
                {totalInternalClicks.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">Klik Lnk.Bio</p>
              <p className="mt-1 text-xl font-bold text-sky-300">
                {totalLnkBioClicks.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Feedback Alerts */}
      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {overview.readyToDeleteCount > 0 ? (
        <div
          role="region"
          aria-label="Peringatan Tautan Produk Non-Aktif"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/35 px-4 py-3 text-xs text-amber-100"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <span>
              Ada <strong>{overview.readyToDeleteCount}</strong> tautan Lnk.Bio yang produknya sudah
              berstatus PAUSED/DROPPED (Siap Dihapus setelah konfirmasi operator).
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setActiveTab('links')}>
            Tinjau Tautan
          </Button>
        </div>
      ) : null}

      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Menu Pengelolaan Lnk.Bio"
        className="flex flex-wrap gap-2 border-b border-[var(--border-hairline)] pb-3"
      >
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === 'links'}
          variant={activeTab === 'links' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('links')}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Tautan Aktif & Jadwal ({overview.links.length})
        </Button>
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === 'reorder'}
          variant={activeTab === 'reorder' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('reorder')}
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
          Bulk Reorder ({activeLinks.length})
        </Button>
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          variant={activeTab === 'analytics' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          Sync Logs & Hybrid Analytics
        </Button>
      </div>

      {/* Tab 1: Active Links & Promo Schedule */}
      {activeTab === 'links' ? (
        <Card>
          <CardHeader
            title="Daftar Tautan Lnk.Bio & Jadwal Promo (RFC 3339)"
            subtitle="Auto-Add & Auto-Edit sinkron otomatis saat produk kurasi diubah; penghapusan memerlukan konfirmasi operator."
          />
          {overview.links.length === 0 ? (
            <StatePanel
              status="empty"
              title="Belum ada tautan affiliate di Lnk.Bio"
              description="Promosikan produk ke CURATED atau ACTIVE dengan Shopee/TikTok Shortlink."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2.5 pr-3">Pos</th>
                    <th className="py-2.5 pr-3">Produk & Redirect Hybrid</th>
                    <th className="py-2.5 pr-3">Grup</th>
                    <th className="py-2.5 pr-3">Jadwal Promo</th>
                    <th className="py-2.5 pr-3">Metrik Klik</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 text-right">Aksi Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {overview.links.map((link) => (
                    <tr key={link.id} className="align-top">
                      <td className="py-3 pr-3 font-mono font-semibold text-[var(--text-primary)]">
                        #{link.position || 1}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-[var(--text-primary)]">{link.title}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-emerald-400">
                          /r/{link.redirectCode}
                        </p>
                        <a
                          href={link.trackedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
                        >
                          Lihat URL Tracking
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </td>
                      <td className="py-3 pr-3 text-[var(--text-secondary)]">
                        {link.groupName ?? link.groupId ?? 'Tanpa Grup'}
                      </td>
                      <td className="py-3 pr-3 text-[var(--text-secondary)]">
                        {link.scheduleFrom || link.scheduleTo ? (
                          <div className="space-y-0.5">
                            <div>Mulai: {formatDateTimeId(link.scheduleFrom)}</div>
                            <div>Selesai: {formatDateTimeId(link.scheduleTo)}</div>
                          </div>
                        ) : (
                          <span>Tayang Permanen</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="space-y-0.5 tabular-nums">
                          <div className="text-[var(--text-primary)]">
                            Internal: <strong>{link.internalClicks}</strong>
                          </div>
                          <div className="text-[var(--text-muted)]">
                            Lnk.Bio: {link.lnkBioClicks}
                          </div>
                          <div className="text-emerald-300">
                            Skor: {link.performanceScore ?? 0}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            tone={
                              link.syncStatus === 'SYNCED'
                                ? 'success'
                                : link.syncStatus === 'DELETED'
                                  ? 'neutral'
                                  : link.syncStatus === 'FAILED'
                                    ? 'danger'
                                    : 'warning'
                            }
                          >
                            {link.syncStatus}
                          </Badge>
                          {link.readyForDelete ? (
                            <Badge tone="warning">Siap Dihapus ({link.productStatus})</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Edit jadwal dan grup ${link.title}`}
                            onClick={() => openEditDialog(link)}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit Jadwal
                          </Button>
                          {link.isActive && link.lnkBioId ? (
                            <Button
                              size="sm"
                              variant="danger"
                              aria-label={`Hapus dari Lnk.Bio ${link.title}`}
                              onClick={() => setConfirmDeleteLink(link)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Hapus dari Lnk.Bio
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {/* Tab 2: Bulk Reorder (Operator Confirmation) */}
      {activeTab === 'reorder' ? (
        <Card>
          <CardHeader
            title="Bulk Reorder Tautan Lnk.Bio (Konfirmasi Operator)"
            subtitle="Susun prioritas tautan profil Lnk.Bio berdasarkan skor performa CTR & klik atau atur posisi manual."
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={overview.recommendedOrder.length === 0}
                  onClick={() => setDraftOrder(overview.recommendedOrder)}
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                  Gunakan Urutan Skor Tertinggi
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={draftOrder.length === 0 || busyAction !== null}
                  onClick={() =>
                    void runAction(
                      'reorder',
                      () => onReorder(draftOrder),
                      'Urutan tautan Lnk.Bio berhasil diperbarui.'
                    )
                  }
                >
                  {busyAction === 'reorder'
                    ? 'Menerapkan Urutan...'
                    : 'Terapkan Urutan ke Lnk.Bio'}
                </Button>
              </div>
            }
          />
          {draftOrder.length === 0 ? (
            <StatePanel
              status="empty"
              title="Tidak ada tautan Lnk.Bio aktif untuk diurutkan"
            />
          ) : (
            <ol className="space-y-2">
              {draftOrder.map((productId, idx) => {
                const item = linkByProductId.get(productId);
                if (!item) return null;
                return (
                  <li
                    key={productId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-950 font-mono font-bold text-emerald-300">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Skor Performa: {item.performanceScore ?? 0} • Klik Internal:{' '}
                          {item.internalClicks} • Lnk.Bio: {item.lnkBioClicks}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={idx === 0}
                        aria-label={`Naikkan posisi ${item.title}`}
                        onClick={() => moveOrderItem(idx, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={idx === draftOrder.length - 1}
                        aria-label={`Turunkan posisi ${item.title}`}
                        onClick={() => moveOrderItem(idx, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      ) : null}

      {/* Tab 3: Sync Logs & Hybrid Analytics */}
      {activeTab === 'analytics' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Snapshot Analitik Hybrid"
              subtitle="Perbandingan metrik klik Lnk.Bio, klik redirect internal, CTR, dan estimasi komisi"
              action={<BarChart3 className="h-4 w-4 text-emerald-400" aria-hidden="true" />}
            />
            {metrics.length === 0 ? (
              <StatePanel status="empty" title="Belum ada snapshot metrik" />
            ) : (
              <div className="space-y-2.5">
                {metrics.slice(0, 10).map((snap) => (
                  <div
                    key={snap.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        Lnk.Bio ID: {snap.lnkBioId ?? '—'}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {formatDateTimeId(snap.snapshotDate)} • CTR {snap.ctrPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="font-semibold text-emerald-300">
                        {snap.totalTrackedClicks} klik (Internal {snap.internalRedirectClicks} / Lnk{' '}
                        {snap.lnkBioClicks})
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Skor {snap.performanceScore} • Est. Komisi Rp
                        {snap.estimatedCommissionIdr.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Audit Trail Sync Logs"
              subtitle="Riwayat operasi ADD, EDIT, DELETE, REORDER, dan SYNC ke Lnk.Bio API"
              action={<History className="h-4 w-4 text-sky-400" aria-hidden="true" />}
            />
            {logs.length === 0 ? (
              <StatePanel status="empty" title="Belum ada riwayat sync log" />
            ) : (
              <div className="space-y-2.5">
                {logs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={log.status === 'SUCCESS' ? 'success' : 'danger'}>
                          {log.operation} • {log.status}
                        </Badge>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          HTTP {log.httpStatus ?? '—'} • {log.durationMs ?? 0}ms
                        </span>
                      </div>
                      {log.errorMessage ? (
                        <p className="text-[11px] text-rose-300">{log.errorMessage}</p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {formatDateTimeId(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* Edit Schedule & Group Modal */}
      {editingLink ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-lnkbio-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              <h2
                id="edit-lnkbio-dialog-title"
                className="text-base font-bold text-[var(--text-primary)]"
              >
                Edit Tautan, Kategori & Jadwal Promo Lnk.Bio
              </h2>
            </div>

            <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-4">
              <div>
                <label
                  htmlFor="lnkbio-edit-title"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Judul Tautan di Lnk.Bio
                </label>
                <input
                  id="lnkbio-edit-title"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="lnkbio-edit-group"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Kategori Grup Lnk.Bio (Khusus Paket MINI+)
                </label>
                <select
                  id="lnkbio-edit-group"
                  disabled={!overview.profile.supportsGroups}
                  value={groupDraft}
                  onChange={(e) => setGroupDraft(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">Tanpa Grup</option>
                  {overview.groups.map((grp) => (
                    <option key={grp.groupId} value={grp.groupId}>
                      {grp.groupName} ({grp.linkCount})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="lnkbio-edit-from"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Jadwal Mulai (schedule_from)
                  </label>
                  <input
                    id="lnkbio-edit-from"
                    type="datetime-local"
                    value={scheduleFromDraft}
                    onChange={(e) => setScheduleFromDraft(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="lnkbio-edit-to"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Jadwal Selesai (schedule_to)
                  </label>
                  <input
                    id="lnkbio-edit-to"
                    type="datetime-local"
                    value={scheduleToDraft}
                    onChange={(e) => setScheduleToDraft(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingLink(null)}
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  variant="primary"
                  disabled={busyAction !== null}
                >
                  Simpan & Update ke Lnk.Bio
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Operator Delete Confirmation Dialog */}
      {confirmDeleteLink ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-lnkbio-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[var(--bg-surface)] p-6 shadow-2xl">
            <h2
              id="delete-lnkbio-dialog-title"
              className="text-base font-bold text-rose-200"
            >
              Konfirmasi Hapus Tautan Lnk.Bio
            </h2>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Anda akan menghapus tautan <strong>{confirmDeleteLink.title}</strong> (Lnk.Bio ID:{' '}
              <span className="font-mono">{confirmDeleteLink.lnkBioId}</span>) dari profil Lnk.Bio
              publik. Tindakan ini memerlukan konfirmasi operator sesuai mode Semi-Otomatis.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDeleteLink(null)}
              >
                Batal
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busyAction !== null}
                onClick={() => void handleConfirmDelete()}
              >
                Konfirmasi Hapus Permanen
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
