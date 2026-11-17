import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { DmLogSchema, MetaWebhookPayloadSchema } from '@ebieshop/shared';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import type { QueueRegistry } from '../queues/registry.js';
import { verifyMetaSignature } from '../services/meta-auto-dm.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export function registerMetaWebhookRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler,
  queueRegistry?: QueueRegistry
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/dm-logs',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: z.object({
            items: z.array(DmLogSchema),
          }),
        },
      },
    },
    async () => {
      const items = await container.dmLogs.listDmLogs();
      return { items };
    }
  );

  app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (request, body, done) => {
        request.rawBody = body as Buffer;
        try {
          const parsed = JSON.parse((body as Buffer).toString('utf8')) as unknown;
          done(null, parsed);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );

    webhookScope.get('/webhook/meta', async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const mode = query['hub.mode'];
      const token = query['hub.verify_token'];
      const challenge = query['hub.challenge'] ?? '';

      if (mode === 'subscribe' && token === container.env.META_WEBHOOK_VERIFY_TOKEN) {
        return reply.status(200).type('text/plain').send(challenge);
      }

      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Invalid Meta webhook verify token' },
      });
    });

    webhookScope.post('/webhook/meta', async (request, reply) => {
      const signatureHeader = request.headers['x-hub-signature-256'];
      const signature = Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : signatureHeader;
      const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});

      if (!verifyMetaSignature(rawBody, signature, container.env.META_APP_SECRET)) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid X-Hub-Signature-256' },
        });
      }

      const parsed = MetaWebhookPayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(200).send({ received: true, ignored: true });
      }

      if (queueRegistry) {
        await queueRegistry.queues.META_AUTO_DM.add('meta-webhook-event', parsed.data);
      } else {
        await container.metaAutoDm.processWebhookPayload(parsed.data);
      }

      return reply.status(200).send({ received: true });
    });
  });
}
