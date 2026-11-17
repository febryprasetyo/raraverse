import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ProductSchema } from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';

export function registerProductRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/products',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: z.object({
            items: z.array(ProductSchema),
          }),
        },
      },
    },
    async () => {
      const items = await container.products.listProducts();
      return { items };
    }
  );
}
