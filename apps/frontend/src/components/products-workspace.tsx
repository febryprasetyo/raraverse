'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { ProductsManager } from '@/components/products-manager';
import { useAuth } from '@/lib/auth-context';

export interface ProductsWorkspaceProps {
  mode: 'discovery' | 'curation';
  title: string;
  subtitle: string;
}

export function ProductsWorkspace({
  mode,
  title,
  subtitle,
}: ProductsWorkspaceProps) {
  const { client } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadProducts = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const items = await client.listProducts();
      setProducts(items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat produk');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadProducts();
  }, [client, loadProducts]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
      </header>
      <AuthGuard>
        <ProductsManager
          initialMode={mode}
          products={products}
          loading={loading}
          errorMsg={errorMsg}
          onRetry={() => void loadProducts()}
          onSyncKalodata={async (input) => {
            if (!client) return;
            const res = await client.syncKalodata(input);
            if (!input.previewOnly) {
              await loadProducts();
            }
            return res;
          }}
          onSaveKalodataCandidates={async (input) => {
            if (!client) return;
            const res = await client.saveKalodataCandidates(input);
            await loadProducts();
            return res;
          }}
          onDeleteProduct={async (id) => {
            if (!client) return;
            await client.deleteProduct(id);
            await loadProducts();
          }}
          onUpdateProduct={async (id, patch) => {
            if (!client) return;
            const updated = await client.updateProduct(id, patch);
            await loadProducts();
            return updated;
          }}
          onSyncLnkBio={async (id) => {
            if (!client) return;
            const synced = await client.syncProductLnkBio(id);
            await loadProducts();
            return synced;
          }}
          onDeleteLnkBio={async (id) => {
            if (!client) return;
            await client.deleteLnkBioProductLink(id);
            await loadProducts();
          }}
        />
      </AuthGuard>
    </div>
  );
}
