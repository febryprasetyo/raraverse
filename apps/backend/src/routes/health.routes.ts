import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EnvConfig } from '../config/env.js';
import { QUEUE_NAMES } from '../queues/registry.js';

export function registerHealthRoutes(app: FastifyInstance, env: EnvConfig): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/healthz',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            dataSourceMode: z.enum(['mock', 'real']),
            queues: z.array(z.string()),
          }),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      dataSourceMode: env.DATA_SOURCE_MODE,
      queues: Object.values(QUEUE_NAMES),
    })
  );
}
