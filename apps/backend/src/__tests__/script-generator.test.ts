import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';
import {
  GeminiLlmProvider,
  OpenAiLlmProvider,
  ScriptGeneratorService,
} from '../adapters/llm-providers.js';
import { R2Presigner } from '../services/r2-presigner.js';
import type { Product } from '@ebieshop/shared';

const sampleProduct: Product = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  kalodataProductId: 'kd_rak_001',
  niche: 'perlengkapan_dapur',
  name: 'Rak Bumbu Dapur 2 Tingkat Baja Karbon',
  priceIdr: 49900,
  rating: 4.9,
  commissionRatePct: 12.5,
  isCommissionXtra: true,
  isOfficialStore: true,
  biolinkNumber: '001',
  triggerKeyword: 'RAK01',
  affiliateUrls: {
    shopeeShortlink: 'https://shope.ee/mock-rak01',
  },
  kalodataSnapshot: null,
  rawMediaDir: 'raw_media_dir/550e8400-e29b-41d4-a716-446655440001',
  rawMediaClipCount: 4,
  status: 'ACTIVE',
  createdAt: '2026-11-16T07:00:00.000Z',
  updatedAt: '2026-11-16T07:00:00.000Z',
};

const validLlmJson = {
  hook: 'Meja dapur sempit bikin sumpek? Cek rak lipat di bawah 50 ribu ini!',
  scriptVoiceover:
    'Sering kesal botol bumbu berantakan? Rak bumbu dua tingkat ini kokoh anti karat. Komen RAK01 sekarang atau cek nomor #001 di bio ya!',
  captionSeo:
    'Solusi dapur sempit jadi estetik! Komen RAK01 biar link masuk DM kamu.',
  hashtags: ['#rakdapur', '#dapurminimalis', '#racunshopee'],
  pinnedComment:
    'Mau link resmi dan promo? Komen RAK01 atau cek nomor #001 di bio ya!',
  sceneCues: [
    { order: 1, visualFocus: 'hook_problem', durationSec: 3.5 },
    { order: 2, visualFocus: 'before_after_usage', durationSec: 7.0 },
  ],
};

describe('LLM Script Generator & R2 Presigner', () => {
  it('retries when Gemini returns malformed JSON and succeeds on valid output', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{ invalid json' }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(validLlmJson) }] } },
          ],
        }),
      });

    const gemini = new GeminiLlmProvider({
      apiKey: 'fake-gemini-key',
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const service = new ScriptGeneratorService(gemini, { maxRetries: 2 });

    const output = await service.generateForProduct(sampleProduct, 'problem-solution');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(output.scriptVoiceover).toContain('RAK01');
    expect(output.pinnedComment).toContain('#001');
  });

  it('injects triggerKeyword and biolinkNumber if LLM omits them from CTA', async () => {
    const missingCta = {
      ...validLlmJson,
      scriptVoiceover:
        'Botol bumbu berantakan di dapur sempit? Rak bumbu dua tingkat ini baja karbon anti karat dan gampang dipasang.',
      pinnedComment: 'Link produk resmi dan promo hari ini tersedia untuk kamu!',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(missingCta) } }],
      }),
    });

    const openai = new OpenAiLlmProvider({
      apiKey: 'fake-openai-key',
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const service = new ScriptGeneratorService(openai, { maxRetries: 1 });

    const output = await service.generateForProduct(sampleProduct, 'review-singkat');
    expect(output.scriptVoiceover).toContain('RAK01');
    expect(output.pinnedComment).toContain('RAK01');
    expect(output.pinnedComment).toContain('#001');
  });

  it('generates valid AWS SigV4 presigned PUT URL for R2', () => {
    const presigner = new R2Presigner({
      endpoint: 'https://account123.r2.cloudflarestorage.com',
      bucket: 'ebieshop-media',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      publicBaseUrl: 'https://cdn.ebieshop.test',
    });

    const result = presigner.createPutUrl({
      key: 'renders/asset-123/final.mp4',
      contentType: 'video/mp4',
      expiresInSec: 900,
    });

    expect(result.uploadUrl).toContain('https://account123.r2.cloudflarestorage.com/ebieshop-media/renders/asset-123/final.mp4');
    expect(result.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(result.uploadUrl).toContain('X-Amz-Signature=');
    expect(result.publicUrl).toBe('https://cdn.ebieshop.test/renders/asset-123/final.mp4');
  });

  it('exposes POST /api/v1/content/generate and POST /api/v1/assets/upload-url routes', async () => {
    const testEnv = loadEnvConfig({
      NODE_ENV: 'test',
      PORT: '3001',
      DATA_SOURCE_MODE: 'mock',
      SKIP_QUEUE_CONNECTION: 'true',
      ADMIN_JWT_SECRET: 'test-admin-secret-123456',
      WORKER_SHARED_SECRET: 'test-worker-secret-123456',
      DATABASE_URL: 'postgresql://ebieshop:ebieshop@127.0.0.1:5432/ebieshop',
      REDIS_URL: 'redis://127.0.0.1:6379',
    });

    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const genRes = await app.inject({
      method: 'POST',
      url: '/api/v1/content/generate',
      headers: { authorization: 'Bearer test-admin-secret-123456' },
      payload: {
        productId: '550e8400-e29b-41d4-a716-446655440001',
        angle: 'problem-solution',
      },
    });
    expect(genRes.statusCode).toBe(201);
    const asset = genRes.json().asset;
    expect(asset.productId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(asset.scriptJson.pinnedComment).toContain('RAK01');

    const urlRes = await app.inject({
      method: 'POST',
      url: '/api/v1/assets/upload-url',
      headers: { authorization: 'Bearer test-worker-secret-123456' },
      payload: {
        assetId: asset.id,
        fileName: 'final.mp4',
        contentType: 'video/mp4',
      },
    });
    expect(urlRes.statusCode).toBe(200);
    expect(urlRes.json().uploadUrl).toContain('http');
    expect(urlRes.json().r2Key).toContain(asset.id);

    await app.close();
  });
});
