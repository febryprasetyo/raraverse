'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContentAsset, Product } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { ContentGallery } from '@/components/content-gallery';
import { useAuth } from '@/lib/auth-context';

export default function GalleryPage() {
  const { client } = useAuth();
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadGallery = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [assetList, productList] = await Promise.all([
        client.listContentAssets(),
        client.listProducts(),
      ]);
      setAssets(assetList);
      setProducts(productList);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat galeri');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadGallery();
  }, [client, loadGallery]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Galeri Konten Video 9:16
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Putar, review, approve, atau hapus seluruh aset video yang sudah di-generate dari Content Studio.
        </p>
      </header>
      <AuthGuard>
        <ContentGallery
          assets={assets}
          products={products}
          loading={loading}
          errorMsg={errorMsg}
          onRetry={() => void loadGallery()}
          onReview={async (id, decision) => {
            if (!client) return;
            await client.reviewContent(id, decision);
            await loadGallery();
          }}
          onDelete={async (id) => {
            if (!client) return;
            await client.deleteContent(id);
            await loadGallery();
          }}
        />
      </AuthGuard>
    </div>
  );
}
