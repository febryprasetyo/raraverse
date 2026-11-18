'use client';

import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  Product,
  ThreadsMediaType,
  ThreadsOverview,
} from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface ThreadsManagerProps {
  overview: ThreadsOverview | null;
  products: Product[];
  loading: boolean;
  errorMsg?: string;
  initialOAuthCode?: string;
  onRetry: () => void;
  onTestAppToken: () => Promise<void>;
  onStartUserOAuth: (redirectUri: string) => Promise<void>;
  onConnectCode: (code: string, redirectUri: string) => Promise<void>;
  onConnectAccessToken: (accessToken: string) => Promise<void>;
  onGenerateDraft: (
    productId: string,
    mediaType: ThreadsMediaType
  ) => Promise<{
    rootText: string;
    replyText: string;
    affiliateUrl: string;
    mediaUrl: string | null;
    resolvedMediaType: ThreadsMediaType;
  }>;
  onPublishThread: (input: {
    productId: string;
    mediaType: ThreadsMediaType;
    rootText: string;
    replyText: string;
    mediaUrl?: string;
  }) => Promise<void>;
}

export function ThreadsManager({
  overview,
  products,
  loading,
  errorMsg,
  initialOAuthCode,
  onRetry,
  onTestAppToken,
  onStartUserOAuth,
  onConnectCode,
  onConnectAccessToken,
  onGenerateDraft,
  onPublishThread,
}: ThreadsManagerProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [redirectUri, setRedirectUri] = useState(
    'https://localhost:3000/products/threads'
  );
  const [manualCode, setManualCode] = useState(initialOAuthCode ?? '');
  const [manualToken, setManualToken] = useState('');

  const eligibleProducts = products.filter(
    (p) =>
      Boolean(
        p.affiliateUrls.shopeeShortlink ??
          p.affiliateUrls.tiktokShortlink ??
          p.affiliateUrls.tokopediaShortlink ??
          p.affiliateUrls.biolinkAnchorUrl
      ) && p.status !== 'DROPPED'
  );

  const [selectedProductId, setSelectedProductId] = useState(
    eligibleProducts[0]?.id ?? ''
  );
  const [mediaType, setMediaType] = useState<ThreadsMediaType>('TEXT');
  const [mediaUrl, setMediaUrl] = useState('');
  const [rootText, setRootText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [previewAffiliateUrl, setPreviewAffiliateUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProductId && eligibleProducts[0]?.id) {
      setSelectedProductId(eligibleProducts[0].id);
    }
  }, [eligibleProducts, selectedProductId]);

  useEffect(() => {
    if (initialOAuthCode) {
      setManualCode(initialOAuthCode);
    }
  }, [initialOAuthCode]);

  if (loading) {
    return (
      <StatePanel
        status="loading"
        title="Memuat Threads Automation & Status OAuth..."
      />
    );
  }

  if (errorMsg) {
    return (
      <StatePanel
        status="error"
        title="Gagal memuat data Threads Automation"
        description={errorMsg}
        onRetry={onRetry}
      />
    );
  }

  if (!overview) {
    return (
      <StatePanel
        status="empty"
        title="Belum ada konfigurasi Threads Automation"
        description="Konfigurasikan THREADS_APP_ID dan THREADS_APP_SECRET di server untuk memulai."
      />
    );
  }

  const { profile, posts, logs } = overview;

  async function runAction(
    key: string,
    fn: () => Promise<void>,
    successMessage: string
  ) {
    setBusyAction(key);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successMessage);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Terjadi kesalahan operasi Threads'
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateAiDraft() {
    if (!selectedProductId) return;
    setBusyAction('draft');
    setActionError(null);
    setNotice(null);
    try {
      const draft = await onGenerateDraft(selectedProductId, mediaType);
      setRootText(draft.rootText);
      setReplyText(draft.replyText);
      setPreviewAffiliateUrl(draft.affiliateUrl);
      if (draft.mediaUrl) {
        setMediaUrl(draft.mediaUrl);
      }
      if (draft.resolvedMediaType !== mediaType) {
        setMediaType(draft.resolvedMediaType);
      }
      setNotice('Draf Chained Thread berhasil dibuat otomatis oleh AI (LLM).');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal membuat draf AI Threads'
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublishSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedProductId) return;
    await runAction(
      'publish',
      async () => {
        await onPublishThread({
          productId: selectedProductId,
          mediaType,
          rootText,
          replyText,
          ...(mediaUrl.trim() ? { mediaUrl: mediaUrl.trim() } : {}),
        });
      },
      'Chained Thread (utas utama + balasan link affiliate) berhasil dipublikasikan!'
    );
  }

  const tokenTone =
    profile.tokenStatus === 'USER_TOKEN' || profile.tokenStatus === 'MOCK'
      ? 'success'
      : profile.tokenStatus === 'APP_TOKEN'
        ? 'info'
        : 'warning';

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/60 px-4 py-3 text-xs text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
        >
          {actionError}
        </div>
      ) : null}

      {/* Account & OAuth 2.0 Live Test Card */}
      <Card>
        <CardHeader
          title={`Akun Meta Threads (@${profile.username})`}
          subtitle={`App ID: ${profile.appId || 'Belum diatur'}${profile.userId ? ` • User ID: ${profile.userId}` : ''}`}
          action={<Badge tone={tokenTone}>{profile.tokenStatus}</Badge>}
        />

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label
                htmlFor="threads-redirect-uri"
                className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
              >
                OAuth Redirect Callback URI (harus persis dengan Meta Dashboard)
              </label>
              <input
                id="threads-redirect-uri"
                type="url"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                placeholder="https://localhost:3000/products/threads"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction(
                    'app-token',
                    onTestAppToken,
                    'Verifikasi App Access Token (client_credentials) berhasil dari server!'
                  )
                }
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {busyAction === 'app-token'
                  ? 'Menguji...'
                  : 'Test App Access Token (client_credentials)'}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction(
                    'oauth-start',
                    () => onStartUserOAuth(redirectUri),
                    'Membuka jendela otorisasi Meta Threads...'
                  )
                }
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                Hubungkan User OAuth (@{profile.username})
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-[var(--border-hairline)] pt-4 md:grid-cols-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label
                  htmlFor="threads-manual-code"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Tukar Authorization Code (opsional / otomatis dari ?code=...)
                </label>
                <input
                  id="threads-manual-code"
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Tempel authorization code dari redirect"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction !== null || !manualCode.trim()}
                onClick={() =>
                  void runAction(
                    'exchange-code',
                    () => onConnectCode(manualCode.trim(), redirectUri),
                    'User Access Token (60 hari) berhasil ditukar & disimpan terenkripsi!'
                  )
                }
              >
                Tukar Code
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label
                  htmlFor="threads-manual-token"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Atau Gunakan User Access Token Langsung
                </label>
                <input
                  id="threads-manual-token"
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="THAA... (User Access Token)"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction !== null || !manualToken.trim()}
                onClick={() =>
                  void runAction(
                    'direct-token',
                    () => onConnectAccessToken(manualToken.trim()),
                    'User Access Token Threads terverifikasi dan tersimpan!'
                  )
                }
              >
                Simpan Token
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Chained Thread Publisher */}
      <Card>
        <CardHeader
          title="Publish Chained Thread Affiliate"
          subtitle="Utas utama tanpa link keluar + balasan komentar pertama otomatis berisi link affiliate"
          action={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busyAction !== null || !selectedProductId}
              onClick={() => void handleGenerateAiDraft()}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              {busyAction === 'draft' ? 'Menyusun AI...' : 'Buat Draf AI (LLM)'}
            </Button>
          }
        />

        <form onSubmit={(e) => void handlePublishSubmit(e)} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label
                htmlFor="threads-product-select"
                className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Pilih Produk Affiliate
              </label>
              <select
                id="threads-product-select"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {eligibleProducts.length === 0 ? (
                  <option value="">Belum ada produk dengan shortlink affiliate</option>
                ) : (
                  eligibleProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.biolinkNumber} — {p.name} ({p.triggerKeyword})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="threads-media-type"
                className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Tipe Media Utas Utama
              </label>
              <select
                id="threads-media-type"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as ThreadsMediaType)}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="TEXT">TEXT (Utas Teks Murni)</option>
                <option value="IMAGE">IMAGE (Gambar Produk HTTPS Publik)</option>
                <option value="VIDEO">VIDEO (Video HTTPS Publik)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="threads-media-url"
                className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Media URL Publik (opsional untuk IMAGE/VIDEO)
              </label>
              <input
                id="threads-media-url"
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://cdn.example.com/product.jpg"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="threads-root-text"
                className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Teks Utas Utama (Hook — tanpa link keluar)
              </label>
              <textarea
                id="threads-root-text"
                rows={4}
                maxLength={500}
                value={rootText}
                onChange={(e) => setRootText(e.target.value)}
                placeholder="Kosongkan untuk generate otomatis oleh AI saat publish, atau klik 'Buat Draf AI (LLM)'"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="threads-reply-text"
                className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Teks Balasan Pertama (CTA + Link Affiliate)
              </label>
              <textarea
                id="threads-reply-text"
                rows={4}
                maxLength={500}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Otomatis menyisipkan shortlink affiliate publik (atau /r/:code jika HTTPS publik)"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
              {previewAffiliateUrl ? (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Target Link Affiliate:{' '}
                  <span className="font-mono text-emerald-300">{previewAffiliateUrl}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={busyAction !== null || !selectedProductId}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {busyAction === 'publish'
                ? 'Menerbitkan Chained Thread...'
                : 'Publish Chained Thread Live'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Published History & Sync Logs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Riwayat Chained Threads"
            subtitle={`${posts.length} publikasi tercatat`}
          />
          {posts.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Belum ada utas Threads yang dipublikasikan.
            </p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquarePlus
                        className="h-3.5 w-3.5 text-emerald-400"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        @{post.username} • {post.mediaType}
                      </span>
                    </div>
                    <Badge
                      tone={
                        post.status === 'PUBLISHED'
                          ? 'success'
                          : post.status === 'PARTIAL_ROOT_ONLY'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {post.status}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                    {post.rootText}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>
                      Root: {post.rootPostId ?? '—'} | Reply: {post.replyPostId ?? '—'}
                    </span>
                    {post.permalink ? (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                      >
                        Lihat di Threads
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Audit Log API Threads"
            subtitle="OAuth token exchange & publikasi berantai"
          />
          {logs.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Belum ada log operasi Threads.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-[var(--text-primary)]">
                      {log.operation}
                    </p>
                    {log.errorMessage ? (
                      <p className="mt-0.5 text-[11px] text-rose-300">
                        {log.errorMessage}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {new Date(log.createdAt).toLocaleString('id-ID')}
                        {log.durationMs !== null ? ` • ${log.durationMs}ms` : ''}
                      </p>
                    )}
                  </div>
                  <Badge tone={log.status === 'SUCCESS' ? 'success' : 'danger'}>
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
