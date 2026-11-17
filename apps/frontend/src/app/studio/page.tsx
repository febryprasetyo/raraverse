'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContentAsset, Product } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { ContentStudio } from '@/components/content-studio';
import { useAuth } from '@/lib/auth-context';

export default function StudioPage() {
  const { client } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadStudio = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [prodList, assetList] = await Promise.all([
        client.listProducts(),
        client.listContentAssets(),
      ]);
      setProducts(prodList);
      setAssets(assetList);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat studio');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadStudio();
  }, [client, loadStudio]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Content Studio 9:16
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Generate script AI, tinjau transkrip voiceover, dan verifikasi posisi subtitle pada safe-zone 9:16.
        </p>
      </header>
      <AuthGuard>
        <ContentStudio
          products={products}
          assets={assets}
          loading={loading}
          errorMsg={errorMsg}
          onRetry={() => void loadStudio()}
          onGenerate={async (input) => {
            if (!client) return;
            await client.generateContent(input);
            await loadStudio();
          }}
          onReview={async (assetId, decision, reason) => {
            if (!client) return;
            await client.reviewContent(assetId, decision, reason);
            await loadStudio();
          }}
        />
      </AuthGuard>
    </div>
  );
}
