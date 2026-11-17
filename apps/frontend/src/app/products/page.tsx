'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { ProductsManager } from '@/components/products-manager';
import { useAuth } from '@/lib/auth-context';

export default function ProductsPage() {
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
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Produk & Kurasi Kalodata
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Kelola sinkronisasi Kalodata, shortlink affiliate, trigger keyword, dan kesiapan klip mentah.
        </p>
      </header>
      <AuthGuard>
        <ProductsManager
          products={products}
          loading={loading}
          errorMsg={errorMsg}
          onRetry={() => void loadProducts()}
          onSyncKalodata={async (input) => {
            if (!client) return;
            await client.syncKalodata(input);
            await loadProducts();
          }}
          onUpdateProduct={async (id, patch) => {
            if (!client) return;
            await client.updateProduct(id, patch);
            await loadProducts();
          }}
        />
      </AuthGuard>
    </div>
  );
}
