'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ContentAsset, ContentStatus, Product } from '@ebieshop/shared';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardHeader } from './ui/card';
import { StatePanel } from './ui/state-panel';
import { resolveApiBaseUrl } from '@/lib/api-client';

export interface ContentStudioProps {
  products: Product[];
  assets: ContentAsset[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onGenerateStoryboard?: (input: {
    productId: string;
    angle?: string;
    storyboardPrompt?: string;
    productImageUrl?: string;
    existingAssetId?: string;
  }) => Promise<ContentAsset | undefined>;
  onUploadRenderedVideo?: (
    assetId: string,
    dataUrl: string
  ) => Promise<ContentAsset | undefined>;
  onGenerate?: (input: {
    productId: string;
    angle: string;
    ttsProvider: 'edge-tts' | 'elevenlabs';
    ttsVoiceId: string;
  }) => Promise<void>;
  onReview: (
    assetId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) => Promise<void>;
}

const ANGLE_OPTIONS = [
  { value: 'problem-solution', label: 'Problem & Solusi Harian' },
  { value: 'before-after', label: 'Before - After di Meja' },
  { value: 'review-jujur', label: 'Review Jujur & Keaslian Produk' },
  { value: 'storytelling', label: 'Storytelling Ringkas & Hemat' },
] as const;

const STATUS_BADGE_MAP: Record<
  ContentStatus,
  { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }
> = {
  GENERATING_SCRIPT: { label: 'Prompt & GEO Siap', tone: 'info' },
  RENDERING_VIDEO: { label: 'Memproses Video', tone: 'info' },
  PENDING_REVIEW: { label: 'Siap Review & Approve', tone: 'warning' },
  APPROVED: { label: 'Video Approved', tone: 'success' },
  REJECTED: { label: 'Ditolak / Revisi', tone: 'danger' },
  FAILED: { label: 'Gagal Diproses', tone: 'danger' },
};

function resolveApiMediaUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) {
    return pathOrUrl;
  }
  return `${resolveApiBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function resolveVideoUrl(videoR2Key: string): string {
  if (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${videoR2Key}`;
  }
  return `${resolveApiBaseUrl()}/api/v1/assets/local-file/${videoR2Key}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file sebagai Data URL'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat'));
    reader.readAsDataURL(file);
  });
}

function formatPriceIdr(priceIdr: number): string {
  return `Rp${priceIdr.toLocaleString('id-ID')}`;
}

export function ContentStudio({
  products,
  assets,
  loading,
  errorMsg,
  onRetry,
  onGenerateStoryboard,
  onUploadRenderedVideo,
  onGenerate,
  onReview,
}: ContentStudioProps) {
  const eligibleProducts = useMemo(
    () => products.filter((p) => p.status === 'CURATED' || p.status === 'ACTIVE'),
    [products]
  );

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [angle, setAngle] = useState<string>('problem-solution');
  const [optimisticAsset, setOptimisticAsset] = useState<ContentAsset | null>(null);
  const [editablePrompt, setEditablePrompt] = useState<string>('');
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [copiedField, setCopiedField] = useState<'prompt' | 'caption' | 'pinned' | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);
  const [reviewingDecision, setReviewingDecision] = useState<'APPROVED' | 'REJECTED' | null>(
    null
  );
  const [rejectOpen, setRejectOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string>('');

  // Keep selectedProductId valid inside CURATED/ACTIVE list
  useEffect(() => {
    const firstProduct = eligibleProducts[0];
    if (!firstProduct) {
      if (selectedProductId) setSelectedProductId('');
      return;
    }
    const stillValid = eligibleProducts.some((p) => p.id === selectedProductId);
    if (!stillValid) {
      setSelectedProductId(firstProduct.id);
    }
  }, [eligibleProducts, selectedProductId]);

  const selectedProduct = useMemo(
    () => eligibleProducts.find((p) => p.id === selectedProductId) ?? null,
    [eligibleProducts, selectedProductId]
  );

  // Resolve active asset strictly for the selected product
  const activeAsset = useMemo(() => {
    if (!selectedProductId) return null;
    if (optimisticAsset && optimisticAsset.productId === selectedProductId) {
      return optimisticAsset;
    }
    return assets.find((a) => a.productId === selectedProductId) ?? null;
  }, [assets, optimisticAsset, selectedProductId]);

  useEffect(() => {
    setEditablePrompt(activeAsset?.scriptJson.storyboardPrompt ?? '');
    setRejectOpen(false);
    setRejectReason('');
  }, [activeAsset?.id, activeAsset?.scriptJson.storyboardPrompt]);

  async function handleCopy(field: 'prompt' | 'caption' | 'pinned', text: string) {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2200);
    } catch {
      setActionError('Clipboard tidak tersedia di browser ini. Silakan salin manual.');
    }
  }

  async function handleGeneratePromptAndGeo() {
    if (!selectedProduct) return;
    setActionError('');
    setStatusNotice('');
    setSubmitting(true);
    try {
      if (onGenerateStoryboard) {
        const productImageUrl = selectedProduct.kalodataSnapshot?.imageUrl;
        const created = await onGenerateStoryboard({
          productId: selectedProduct.id,
          angle,
          ...(productImageUrl ? { productImageUrl } : {}),
          ...(activeAsset ? { existingAssetId: activeAsset.id } : {}),
        });
        if (created) {
          setOptimisticAsset(created);
          setEditablePrompt(created.scriptJson.storyboardPrompt ?? '');
          setStatusNotice(
            `Prompt storyboard 6-scene & copywriting GEO untuk "${selectedProduct.name}" siap disalin.`
          );
        }
      } else if (onGenerate) {
        await onGenerate({
          productId: selectedProduct.id,
          angle,
          ttsProvider: 'edge-tts',
          ttsVoiceId: 'id-ID-GadisNeural',
        });
        setStatusNotice(`Prompt & copywriting untuk "${selectedProduct.name}" berhasil dibuat.`);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal membuat prompt storyboard & copywriting GEO'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVideoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeAsset || !onUploadRenderedVideo) return;

    setActionError('');
    setStatusNotice('');
    setUploadingVideo(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const updated = await onUploadRenderedVideo(activeAsset.id, dataUrl);
      if (updated) {
        setOptimisticAsset(updated);
      }
      setStatusNotice('Video .MP4 berhasil diunggah! Periksa preview 9:16 lalu klik Approve Video.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengunggah video .MP4');
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleApprove() {
    if (!activeAsset) return;
    setActionError('');
    setStatusNotice('');
    setReviewingDecision('APPROVED');
    try {
      await onReview(activeAsset.id, 'APPROVED');
      setOptimisticAsset((prev) =>
        prev?.id === activeAsset.id
          ? { ...prev, status: 'APPROVED', rejectionReason: null }
          : prev
      );
      setStatusNotice('Video disetujui (APPROVED) dan siap dijadwalkan di antrean Publish.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyetujui video');
    } finally {
      setReviewingDecision(null);
    }
  }

  async function handleConfirmReject() {
    if (!activeAsset) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 3) {
      setActionError('Masukkan alasan penolakan minimal 3 karakter.');
      return;
    }
    setActionError('');
    setStatusNotice('');
    setReviewingDecision('REJECTED');
    try {
      await onReview(activeAsset.id, 'REJECTED', trimmed);
      setOptimisticAsset((prev) =>
        prev?.id === activeAsset.id
          ? { ...prev, status: 'REJECTED', rejectionReason: trimmed }
          : prev
      );
      setRejectOpen(false);
      setRejectReason('');
      setStatusNotice('Status video ditandai Ditolak. Upload ulang video baru jika sudah direvisi.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menolak video');
    } finally {
      setReviewingDecision(null);
    }
  }

  if (loading) {
    return (
      <StatePanel
        status="loading"
        title="Memuat Content Studio"
        description="Menyiapkan daftar produk terkurasi dan paket prompt Gemini Web."
      />
    );
  }

  if (errorMsg) {
    return (
      <StatePanel
        status="error"
        title="Gagal Memuat Content Studio"
        description={errorMsg}
        onRetry={onRetry}
      />
    );
  }

  if (eligibleProducts.length === 0) {
    return (
      <Card>
        <StatePanel
          status="empty"
          title="Belum Ada Produk Curated atau Active"
          description="Content Studio hanya menampilkan produk berlabel CURATED atau ACTIVE. Kurasi dan aktifkan produk terlebih dahulu di menu Produk."
        />
        <div className="mt-4 flex justify-center">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
          >
            Buka Daftar Produk
          </Link>
        </div>
      </Card>
    );
  }

  const productImageUrl = selectedProduct?.kalodataSnapshot?.imageUrl;
  const captionGeoText = activeAsset
    ? `${activeAsset.scriptJson.captionSeo}\n\n${activeAsset.scriptJson.hashtags.join(' ')}`
    : '';
  const pinnedCommentText = activeAsset?.scriptJson.pinnedComment ?? '';
  const assetStatusMeta = activeAsset ? STATUS_BADGE_MAP[activeAsset.status] : null;
  const videoSrc = activeAsset?.videoR2Key ? resolveVideoUrl(activeAsset.videoR2Key) : null;

  return (
    <div className="space-y-6">
      {actionError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm font-medium text-rose-200"
        >
          {actionError}
        </div>
      ) : null}

      {statusNotice ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-3 text-sm font-medium text-emerald-200"
        >
          {statusNotice}
        </div>
      ) : null}

      {/* Step 1: Pilih Produk Curated/Active & Generate Prompt Storyboard + GEO */}
      <Card>
        <CardHeader
          title="1. Generator Prompt Storyboard (6 Scene) & Copywriting GEO"
          subtitle="Pilih produk berstatus CURATED atau ACTIVE, generate prompt spesifik produk untuk Gemini Web, lalu unduh foto produk aslinya."
          action={
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Buka Gemini Web
            </a>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="studio-product-select"
                className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Pilih Produk (Curated / Active)
              </label>
              <select
                id="studio-product-select"
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setStatusNotice('');
                  setActionError('');
                }}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                {eligibleProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} [{product.status}] — {formatPriceIdr(product.priceIdr)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="studio-angle-select"
                className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Angle Storyboard & GEO
              </label>
              <select
                id="studio-angle-select"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                {ANGLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => void handleGeneratePromptAndGeo()}
              disabled={submitting || !selectedProduct}
              className="w-full lg:w-auto"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {submitting
                ? 'Menyusun Prompt & GEO...'
                : activeAsset
                  ? 'Regenerate Prompt & Copywriting GEO'
                  : 'Generate Prompt & Copywriting GEO'}
            </Button>
          </div>
        </div>

        {selectedProduct ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
            <div className="flex items-center gap-4">
              {productImageUrl ? (
                <img
                  src={resolveApiMediaUrl(productImageUrl)}
                  alt={`Foto produk ${selectedProduct.name}`}
                  className="h-16 w-16 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)]">
                  No Foto
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedProduct.name}
                  </p>
                  <Badge tone={selectedProduct.status === 'ACTIVE' ? 'success' : 'info'}>
                    {selectedProduct.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Niche: <span className="font-medium">{selectedProduct.niche}</span> • Harga:{' '}
                  <span className="font-medium">{formatPriceIdr(selectedProduct.priceIdr)}</span> •
                  Keyword CTA:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {selectedProduct.triggerKeyword}
                  </span>{' '}
                  (#{selectedProduct.biolinkNumber})
                </p>
              </div>
            </div>

            {productImageUrl ? (
              <a
                href={resolveApiMediaUrl(productImageUrl)}
                download={`${selectedProduct.triggerKeyword.toLowerCase()}-product.jpg`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Unduh Foto Produk
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* Main 2-column workspace: Prompt + GEO Copy + Video Upload | 9:16 Preview */}
      {activeAsset ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_340px] lg:items-start">
          <div className="space-y-6">
            {/* Step 2: Prompt Storyboard Gemini Web */}
            <Card>
              <CardHeader
                title="2. Prompt Storyboard Gemini Web (6 Scene)"
                subtitle="Salin prompt khusus produk ini dan tempelkan ke Gemini Web bersama foto produk & foto referensi meja tangan rajut cream."
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleCopy('prompt', editablePrompt)}
                  >
                    {copiedField === 'prompt' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        Prompt Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Salin Prompt
                      </>
                    )}
                  </Button>
                }
              />

              <div>
                <label
                  htmlFor="studio-storyboard-prompt"
                  className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
                >
                  Prompt Storyboard Spesifik Produk
                </label>
                <textarea
                  id="studio-storyboard-prompt"
                  rows={4}
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-3 text-sm leading-relaxed text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                />
              </div>
            </Card>

            {/* Step 3: Caption SEO + GEO & Tags + Pinned Comment */}
            <Card>
              <CardHeader
                title="3. Caption SEO & GEO + Hashtag"
                subtitle="Dioptimalkan untuk pencarian sosial media (SEO) dan AI Answer Engine / Generative Search (GEO)."
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleCopy('caption', captionGeoText)}
                  >
                    {copiedField === 'caption' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        Caption Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Salin Caption & Hashtag
                      </>
                    )}
                  </Button>
                }
              />

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="studio-caption-geo"
                    className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    Caption SEO & GEO
                  </label>
                  <textarea
                    id="studio-caption-geo"
                    readOnly
                    rows={5}
                    value={activeAsset.scriptJson.captionSeo}
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-3 text-sm leading-relaxed text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
                    Hashtags SEO & GEO
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeAsset.scriptJson.hashtags.map((tag) => (
                      <Badge key={tag} tone="info">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[var(--border-hairline)] pt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor="studio-pinned-comment"
                      className="block text-xs font-semibold text-[var(--text-secondary)]"
                    >
                      Pinned Comment CTA (Auto-DM Trigger)
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCopy('pinned', pinnedCommentText)}
                    >
                      {copiedField === 'pinned' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                          Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Salin Pinned Comment
                        </>
                      )}
                    </Button>
                  </div>
                  <input
                    id="studio-pinned-comment"
                    type="text"
                    readOnly
                    value={pinnedCommentText}
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  />
                </div>
              </div>
            </Card>

            {/* Step 4: Upload Video Jadi (.MP4) & Approval */}
            <Card>
              <CardHeader
                title="4. Upload Video Jadi (.MP4) & Approval"
                subtitle="Unggah video final yang sudah Anda buat lewat Gemini Web / AI Video, cek preview 9:16, lalu setujui untuk masuk antrean Publish."
                action={
                  assetStatusMeta ? (
                    <Badge tone={assetStatusMeta.tone}>{assetStatusMeta.label}</Badge>
                  ) : null
                }
              />

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="upload-gemini-video"
                    className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    Upload Video Jadi (.MP4 / .WebM / .MOV)
                  </label>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
                    <Upload className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
                    <input
                      id="upload-gemini-video"
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      disabled={uploadingVideo}
                      onChange={(e) => void handleVideoUpload(e)}
                      className="block w-full max-w-sm text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800 dark:file:bg-emerald-600"
                    />
                    {uploadingVideo ? (
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        Mengunggah video...
                      </span>
                    ) : null}
                  </div>
                </div>

                {activeAsset.rejectionReason ? (
                  <p className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-200">
                    Catatan revisi sebelumnya: {activeAsset.rejectionReason}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    onClick={() => void handleApprove()}
                    disabled={!videoSrc || reviewingDecision !== null}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {reviewingDecision === 'APPROVED' ? 'Menyimpan...' : 'Approve Video'}
                  </Button>

                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setRejectOpen((prev) => !prev)}
                    disabled={reviewingDecision !== null}
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Reject
                  </Button>
                </div>

                {rejectOpen ? (
                  <div className="space-y-3 rounded-xl border border-rose-500/40 bg-rose-950/35 p-4">
                    <div>
                      <label
                        htmlFor="studio-reject-reason"
                        className="mb-1.5 block text-xs font-semibold text-rose-200"
                      >
                        Alasan Penolakan / Revisi Video
                      </label>
                      <input
                        id="studio-reject-reason"
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Misal: doodle text kurang jelas atau rasio tidak 9:16"
                        className="w-full rounded-xl border border-rose-700/70 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => void handleConfirmReject()}
                        disabled={reviewingDecision !== null}
                      >
                        {reviewingDecision === 'REJECTED' ? 'Mengirim...' : 'Konfirmasi Reject'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejectOpen(false);
                          setRejectReason('');
                        }}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          {/* Right column: Sticky 9:16 Preview & Safe-Zone */}
          <Card className="lg:sticky lg:top-6">
            <CardHeader
              title="Preview 9:16 (1080×1920)"
              subtitle="Pastikan teks penting berada di dalam area aman."
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-pressed={showSafeZone}
                  onClick={() => setShowSafeZone((prev) => !prev)}
                >
                  {showSafeZone ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Sembunyikan Safe-Zone
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      Tampilkan Safe-Zone
                    </>
                  )}
                </Button>
              }
            />

            <div className="relative mx-auto aspect-[9/16] w-full max-w-[290px] overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-slate-950">
              {videoSrc ? (
                <video
                  src={videoSrc}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-300">
                  <Upload className="mb-3 h-7 w-7 text-slate-400" aria-hidden="true" />
                  <p className="text-xs font-medium leading-relaxed">
                    Belum ada video terunggah untuk produk ini. Upload file `.MP4` hasil Gemini Web
                    di langkah 4.
                  </p>
                </div>
              )}

              {showSafeZone ? (
                <div
                  role="img"
                  aria-label="Overlay Safe Zone TikTok dan Reels"
                  className="pointer-events-none absolute inset-0"
                >
                  <div className="absolute inset-x-0 top-0 h-[14%] border-b border-dashed border-amber-300/80 bg-amber-400/15" />
                  <div className="absolute right-0 top-[14%] bottom-[28%] w-[16%] border-l border-dashed border-amber-300/80 bg-amber-400/15" />
                  <div className="absolute inset-x-0 bottom-0 h-[28%] border-t border-dashed border-amber-300/80 bg-amber-400/15" />
                </div>
              ) : null}
            </div>

            {activeAsset.durationSec ? (
              <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
                Durasi video: {activeAsset.durationSec} detik
              </p>
            ) : null}
          </Card>
        </div>
      ) : (
        <Card>
          <StatePanel
            status="empty"
            title="Siap Generate Prompt & GEO Copywriting"
            description="Klik tombol 'Generate Prompt & Copywriting GEO' di atas untuk membuat prompt storyboard 6-scene khusus produk terpilih beserta caption SEO + GEO."
          />
        </Card>
      )}
    </div>
  );
}
