import { ProductSchema, type Product } from '@ebieshop/shared';
import { z } from 'zod';

const ProductsResponseSchema = z.object({
  items: z.array(ProductSchema),
});

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export function createBackendClient(options: ApiClientOptions) {
  const fetcher = options.fetchImpl ?? fetch;

  return {
    async listProducts(): Promise<Product[]> {
      const response = await fetcher(`${options.baseUrl}/api/v1/products`, {
        headers: {
          authorization: `Bearer ${options.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Backend request failed with status ${response.status}`);
      }

      const json: unknown = await response.json();
      return ProductsResponseSchema.parse(json).items;
    },
  };
}
