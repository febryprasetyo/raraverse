'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Product, ThreadsOverview } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { ThreadsManager } from '@/components/threads-manager';
import { useAuth } from '@/lib/auth-context';

export default function ProductsThreadsPage() {
  const { client } = useAuth();
  const [overview, setOverview] = useState<ThreadsOverview | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [oauthCode, setOauthCode] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setOauthCode(code.replace(/#_$/, ''));
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [nextOverview, nextProducts] = await Promise.all([
        client.getThreadsOverview(),
        client.listProducts(),
      ]);
      setOverview(nextOverview);
      setProducts(nextProducts);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data Threads');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadData();
  }, [client, loadData]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Threads Automation & Chained Affiliate
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Uji koneksi App/User OAuth 2.0 Meta Threads (@raraverse), buat draf AI otomatis, dan
          publikasikan utas berantai dengan balasan link affiliate.
        </p>
      </header>
      <AuthGuard>
        <ThreadsManager
          overview={overview}
          products={products}
          loading={loading}
          errorMsg={errorMsg}
          initialOAuthCode={oauthCode}
          onRetry={() => void loadData()}
          onTestAppToken={async () => {
            if (!client) return;
            await client.connectThreadsAuth({ mode: 'client_credentials' });
            await loadData();
          }}
          onStartUserOAuth={async (redirectUri) => {
            if (!client) return;
            const res = await client.getThreadsAuthorizeUrl(redirectUri);
            window.open(res.authorizeUrl, '_blank', 'noopener,noreferrer');
          }}
          onConnectCode={async (code, redirectUri) => {
            if (!client) return;
            await client.connectThreadsAuth({
              mode: 'authorization_code',
              code,
              redirectUri,
            });
            await loadData();
          }}
          onConnectAccessToken={async (accessToken) => {
            if (!client) return;
            await client.connectThreadsAuth({
              mode: 'access_token',
              accessToken,
            });
            await loadData();
          }}
          onGenerateDraft={async (productId, mediaType) => {
            if (!client) {
              throw new Error('Client belum siap');
            }
            return client.draftThreadsProductPost(productId, mediaType);
          }}
          onPublishThread={async (input) => {
            if (!client) return;
            await client.publishThreadsProductPost(input.productId, {
              mediaType: input.mediaType,
              rootText: input.rootText,
              replyText: input.replyText,
              mediaUrl: input.mediaUrl,
            });
            await loadData();
          }}
        />
      </AuthGuard>
    </div>
  );
}
