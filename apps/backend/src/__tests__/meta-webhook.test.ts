import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';
import {
  matchTriggerKeyword,
  MetaAutoDmProcessor,
  verifyMetaSignature,
} from '../services/meta-auto-dm.js';
import { MockDmLogRepository, MockProductRepository } from '../adapters/mock-adapters.js';
import type { IMetaGraphClient } from '../adapters/meta-graph-client.js';

const APP_SECRET = 'meta-app-secret-for-testing-123456';
const VERIFY_TOKEN = 'meta-verify-token-123456';

function signPayload(rawBody: string, secret = APP_SECRET): string {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

const testEnv = loadEnvConfig({
  NODE_ENV: 'test',
  PORT: '3001',
  DATA_SOURCE_MODE: 'mock',
  SKIP_QUEUE_CONNECTION: 'true',
  ADMIN_JWT_SECRET: 'test-admin-secret-123456',
  WORKER_SHARED_SECRET: 'test-worker-secret-123456',
  DATABASE_URL: 'postgresql://ebieshop:ebieshop@127.0.0.1:5432/ebieshop',
  REDIS_URL: 'redis://127.0.0.1:6379',
  META_APP_SECRET: APP_SECRET,
  META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
});

describe('Meta Webhook & Idempotent Comment-to-DM', () => {
  it('handles GET /webhook/meta verification handshake (valid & invalid)', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const validRes = await app.inject({
      method: 'GET',
      url: `/webhook/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge_999`,
    });
    expect(validRes.statusCode).toBe(200);
    expect(validRes.body).toBe('challenge_999');

    const invalidRes = await app.inject({
      method: 'GET',
      url: '/webhook/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_999',
    });
    expect(invalidRes.statusCode).toBe(403);

    await app.close();
  });

  it('rejects POST /webhook/meta with 401 when X-Hub-Signature-256 is invalid or missing', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });
    const payload = JSON.stringify({
      object: 'instagram',
      entry: [],
    });

    const missingSig = await app.inject({
      method: 'POST',
      url: '/webhook/meta',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(missingSig.statusCode).toBe(401);

    const badSig = await app.inject({
      method: 'POST',
      url: '/webhook/meta',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=deadbeef',
      },
      payload,
    });
    expect(badSig.statusCode).toBe(401);

    const validSig = await app.inject({
      method: 'POST',
      url: '/webhook/meta',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signPayload(payload),
      },
      payload,
    });
    expect(validSig.statusCode).toBe(200);

    await app.close();
  });

  it('matches triggerKeyword case-insensitively and tolerates spaces (rak 01 -> RAK01)', async () => {
    const productsRepo = new MockProductRepository();
    const products = await productsRepo.listProducts();

    expect(matchTriggerKeyword('Mau dong kak rak 01 nya!', products)?.triggerKeyword).toBe(
      'RAK01'
    );
    expect(matchTriggerKeyword('lampu02', products)?.triggerKeyword).toBe('LAMPU02');
    expect(matchTriggerKeyword('keren banget videonya', products)).toBeNull();
  });

  it('verifies HMAC-SHA256 signature helper', () => {
    const body = '{"hello":"world"}';
    expect(verifyMetaSignature(body, signPayload(body), APP_SECRET)).toBe(true);
    expect(verifyMetaSignature(body, 'sha256=0000', APP_SECRET)).toBe(false);
  });

  it('processes comment-to-DM idempotently and ignores own account comments', async () => {
    const productsRepo = new MockProductRepository();
    const dmLogsRepo = new MockDmLogRepository();
    const replyToComment = vi.fn().mockResolvedValue(undefined);
    const sendPrivateReplyDm = vi.fn().mockResolvedValue(undefined);
    const metaClient: IMetaGraphClient = {
      replyToComment,
      sendPrivateReplyDm,
    };

    const processor = new MetaAutoDmProcessor({
      products: productsRepo,
      dmLogs: dmLogsRepo,
      metaClient,
      ownAccountIds: ['own_ig_account_1'],
    });

    const payload = {
      object: 'instagram' as const,
      entry: [
        {
          id: 'ig_entry_1',
          time: 1731740000,
          changes: [
            {
              field: 'comments',
              value: {
                id: 'comment_unique_101',
                text: 'Kak mau link rak 01 dong',
                from: { id: 'viewer_1', username: 'budi_santoso' },
                media: { id: 'media_1', media_product_type: 'REELS' },
              },
            },
          ],
        },
      ],
    };

    await processor.processWebhookPayload(payload);
    expect(replyToComment).toHaveBeenCalledTimes(1);
    expect(sendPrivateReplyDm).toHaveBeenCalledTimes(1);
    expect(sendPrivateReplyDm.mock.calls[0]?.[0]?.message).toContain(
      'https://shope.ee/mock-rak01'
    );

    // Duplicate webhook delivery with same comment_id must NOT send DM twice
    await processor.processWebhookPayload(payload);
    expect(replyToComment).toHaveBeenCalledTimes(1);
    expect(sendPrivateReplyDm).toHaveBeenCalledTimes(1);

    // Own account comment must be ignored
    await processor.processWebhookPayload({
      object: 'instagram',
      entry: [
        {
          id: 'ig_entry_2',
          time: 1731740005,
          changes: [
            {
              field: 'comments',
              value: {
                id: 'comment_own_999',
                text: 'Komen RAK01 ya!',
                from: { id: 'own_ig_account_1', username: 'ebieshop_official' },
                media: { id: 'media_1' },
              },
            },
          ],
        },
      ],
    });
    expect(replyToComment).toHaveBeenCalledTimes(1);
    expect(sendPrivateReplyDm).toHaveBeenCalledTimes(1);
  });
});
