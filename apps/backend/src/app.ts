import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { EnvConfig } from './config/env.js';
import { createAppContainer } from './container.js';
import { createBearerGuard } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { createQueueRegistry, type QueueRegistry } from './queues/registry.js';
import { registerAdminRoutes } from './routes/admin.routes.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import { registerProductRoutes } from './routes/products.routes.js';
import { registerWorkerRoutes } from './routes/workers.routes.js';

export interface BuildAppOptions {
  env: EnvConfig;
  skipQueueConnection?: boolean;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.env.NODE_ENV !== 'test',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cors, {
    origin:
      options.env.NODE_ENV === 'production'
        ? false
        : ['http://127.0.0.1:3000', 'http://localhost:3000'],
    credentials: true,
  });
  registerErrorHandler(app);

  let queueRegistry: QueueRegistry | undefined;
  if (!options.skipQueueConnection) {
    queueRegistry = createQueueRegistry(options.env.REDIS_URL);
    app.addHook('onClose', async () => {
      if (queueRegistry) {
        await queueRegistry.close();
      }
    });
  }

  const container = createAppContainer(options.env);
  const adminGuard = createBearerGuard(options.env.ADMIN_JWT_SECRET, 'admin');
  const workerGuard = createBearerGuard(options.env.WORKER_SHARED_SECRET, 'worker');

  registerHealthRoutes(app, options.env);
  registerAdminRoutes(app, adminGuard);
  registerWorkerRoutes(app, workerGuard);
  registerProductRoutes(app, container, adminGuard);

  return app;
}
