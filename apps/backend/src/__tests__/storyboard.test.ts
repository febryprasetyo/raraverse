import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Product, ScriptGeneratorOutput } from '@ebieshop/shared';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';
import { StoryboardImageGenerator } from '../services/storyboard-generator.js';

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

const adminHeaders = {
  authorization: 'Bearer test-admin-secret-123456',
};

const sampleProduct: Product = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  kalodataProductId: 'kd_rak_001',
  niche: 'perlengkapan_dapur',
  name: 'Rak Bumbu Dapur 2 Tingkat',
  priceIdr: 49900,
  rating: 4.9,
  commissionRatePct: 12.5,
  isCommissionXtra: true,
  isOfficialStore: true,
  biolinkNumber: '001',
  triggerKeyword: 'RAK01',
  affiliateUrls: {},
  kalodataSnapshot: null,
  rawMediaDir: 'raw_media_dir/kd_rak_001',
  rawMediaClipCount: 2,
  status: 'ACTIVE',
  createdAt: '2026-11-17T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
};

const sampleScript: ScriptGeneratorOutput = {
  hook: 'Dapur berantakan? Pakai rak ini!',
  scriptVoiceover: 'Meja dapur rapi banget pakai rak dua tingkat ini. Komen RAK01 ya!',
  captionSeo: 'Rak bumbu dapur estetik.',
  hashtags: ['#rakdapur'],
  pinnedComment: 'Komen RAK01 atau cek #001 di bio!',
  sceneCues: [
    { order: 1, visualFocus: 'Meja estetik dengan produk', doodleText: 'Cute! ✨', durationSec: 4 },
    { order: 2, visualFocus: 'Tangan baju cream menata rak', doodleText: 'Rapi! 💛', durationSec: 4 },
  ],
};

describe('Two-Stage Storyboard Generation & Video Render Workflow', () => {
  const createdAssetIds: string[] = [];

  afterAll(async () => {
    const localRoot = resolve(process.cwd(), '.local-storage');
    await Promise.all(
      createdAssetIds.map((id) =>
        rm(join(localRoot, 'storyboards', id), { recursive: true, force: true }).catch(() => {})
      )
    );
  });

  it('calls Gemini Multimodal with product + background inlineData and saves storyboard-grid.jpg', async () => {
    const fakeAiImage = Buffer.alloc(512, 0xff);
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'image/png',
                        data: fakeAiImage.toString('base64'),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(Buffer.from('img-bytes'), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    });

    const tempRoot = join(tmpdir(), `ebieshop-sb-test-${Date.now()}`);
    try {
      const generator = new StoryboardImageGenerator();
      const res = await generator.generateSixPanelGrid({
        assetId: 'asset-test-1',
        product: sampleProduct,
        script: sampleScript,
        storyboardPrompt: '6 scene meja tangan cream doodle cute',
        productImageUrl: 'https://cdn.example.com/prod.jpg',
        backgroundImageUrl: 'https://cdn.example.com/bg.jpg',
        localStorageRoot: tempRoot,
        geminiApiKey: 'test-gemini-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(res.publicPath).toBe('storyboards/asset-test-1/storyboard-grid.jpg');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('runs Stage 1 storyboard creation/regeneration, preset upload, and Stage 2 render transition', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/content/reference-image',
      headers: adminHeaders,
      payload: {
        kind: 'background',
        dataUrl: `data:image/png;base64,${tinyPngBase64}`,
      },
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.json().imageUrl).toContain('/api/v1/assets/local-file/presets/default-background.png');

    const getPresetRes = await app.inject({
      method: 'GET',
      url: '/api/v1/content/reference-image',
      headers: adminHeaders,
    });
    expect(getPresetRes.statusCode).toBe(200);
    expect(getPresetRes.json().backgroundImageUrl).toBe(
      '/api/v1/assets/local-file/presets/default-background.png'
    );

    const stage1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/content/storyboard',
      headers: adminHeaders,
      payload: {
        productId: '550e8400-e29b-41d4-a716-446655440001',
      },
    });
    expect(stage1Res.statusCode).toBe(201);
    const createdAsset = stage1Res.json().asset;
    createdAssetIds.push(createdAsset.id);
    expect(createdAsset.status).toBe('GENERATING_SCRIPT');
    expect(createdAsset.scriptJson.storyboardPrompt).toContain('6 scene');
    expect(createdAsset.scriptJson.storyboardPrompt).toContain('rajut warna cream');
    expect(createdAsset.scriptJson.storyboardPrompt.toLowerCase()).toContain('doodle');
    expect(createdAsset.scriptJson.storyboardPrompt.toLowerCase()).toContain('keaslian');
    expect(createdAsset.scriptJson.captionSeo.toLowerCase()).toContain('rak');
    expect(createdAsset.scriptJson.sceneCues).toHaveLength(6);
    expect(createdAsset.scriptJson.sceneCues[0].doodleText).toBeTruthy();
    expect(createdAsset.scriptJson.storyboardImageUrl).toBeUndefined();

    // Regenerate storyboard script on same asset
    const regenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/content/storyboard',
      headers: adminHeaders,
      payload: {
        productId: '550e8400-e29b-41d4-a716-446655440001',
        existingAssetId: createdAsset.id,
        storyboardPrompt: '6 scene meja kayu cream doodle super cute v2',
      },
    });
    expect(regenRes.statusCode).toBe(200);
    expect(regenRes.json().asset.id).toBe(createdAsset.id);
    expect(regenRes.json().asset.scriptJson.storyboardPrompt).toContain('v2');

    // Direct upload video from Gemini Web
    const fakeMp4Base64 = Buffer.from('fake-mp4-video-content').toString('base64');
    const uploadVideoRes = await app.inject({
      method: 'POST',
      url: `/api/v1/content/${createdAsset.id}/upload-video`,
      headers: adminHeaders,
      payload: {
        dataUrl: `data:video/mp4;base64,${fakeMp4Base64}`,
        durationSec: 16.5,
      },
    });
    expect(uploadVideoRes.statusCode).toBe(200);
    expect(uploadVideoRes.json().asset.status).toBe('PENDING_REVIEW');
    expect(uploadVideoRes.json().asset.videoR2Key).toBe(`renders/${createdAsset.id}/final.mp4`);

    // Cleanup deleting asset also deletes storyboard directory & renders directory
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/content/${createdAsset.id}`,
      headers: adminHeaders,
    });
    expect(deleteRes.statusCode).toBe(200);

    await rm(
      resolve(process.cwd(), '.local-storage', 'presets', 'default-background.png'),
      { force: true }
    ).catch(() => {});
    await app.close();
  });
});
