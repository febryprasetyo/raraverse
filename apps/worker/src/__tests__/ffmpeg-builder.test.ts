import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildFfmpegStitchArgs } from '../ffmpeg/ffmpeg-builder.js';
import { processLocalVideoRender } from '../ffmpeg/render-worker.js';
import { MockTtsProvider } from '../tts/providers.js';

describe('FFmpeg 1080x1920 Stitcher Args Builder', () => {
  it('builds 1080x1920 30fps yuv420p libx264 args with ASS burn-in, BGM ducking, and metadata stripping', () => {
    const args = buildFfmpegStitchArgs({
      clipPaths: ['/raw/clip_01.mp4', '/raw/clip_02.mp4'],
      voiceoverPath: '/work/voice.mp3',
      subtitleAssPath: '/work/subtitles.ass',
      bgmPath: '/bgm/chill.mp3',
      outputPath: '/work/final.mp4',
      targetDurationSec: 18.5,
    });

    const joined = args.join(' ');
    expect(joined).toContain('1080');
    expect(joined).toContain('1920');
    expect(joined).toContain('fps=30');
    expect(joined).toContain('yuv420p');
    expect(joined).toContain('libx264');
    expect(joined).toContain('sidechaincompress');
    expect(joined).toContain('ass=');
    expect(joined).toContain('-map_metadata -1');
    expect(joined).toContain('-fflags +bitexact');
    expect(args.at(-1)).toBe('/work/final.mp4');
  });

  it('builds valid args even when bgmPath is omitted', () => {
    const args = buildFfmpegStitchArgs({
      clipPaths: ['/raw/clip_01.mp4'],
      voiceoverPath: '/work/voice.mp3',
      subtitleAssPath: '/work/subtitles.ass',
      outputPath: '/work/final.mp4',
      targetDurationSec: 12,
    });

    const joined = args.join(' ');
    expect(joined).not.toContain('sidechaincompress');
    expect(joined).toContain('-map_metadata -1');
    expect(args.at(-1)).toBe('/work/final.mp4');
  });

  it('synthesizes AI fallback clips when rawMediaDir is missing and cleans up temp workDir', async () => {
    const assetId = '550e8400-e29b-41d4-a716-446655440099';
    const workDir = join(tmpdir(), `ebieshop-render-${assetId}`);
    const mockFfmpeg = vi.fn(async (args: string[]) => {
      const outPath = args.at(-1);
      if (outPath) {
        await writeFile(outPath, Buffer.from('mock-mp4-data'));
      }
    });
    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/v1/assets/upload-url')) {
        const body = JSON.parse(init?.body as string) as { fileName: string };
        return new Response(
          JSON.stringify({
            uploadUrl: `https://upload.test/${body.fileName}`,
            r2Key: `renders/${assetId}/${body.fileName}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.startsWith('https://upload.test/')) {
        return new Response('', { status: 200 });
      }
      if (urlStr.includes('product.example.com')) {
        return new Response(Buffer.from('fake-jpeg-data'), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response('', { status: 404 });
    });

    const result = await processLocalVideoRender(
      {
        contentAssetId: assetId,
        productId: '550e8400-e29b-41d4-a716-446655440001',
        rawMediaDir: join(tmpdir(), `missing-raw-${assetId}`),
        productName: 'Parutan Duduk Keripik',
        productImageUrl: 'https://product.example.com/item.jpg',
        scriptJson: {
          hook: 'Capek iris keripik lama banget?',
          scriptVoiceover: 'Pakai parutan duduk ini aja biar cepat rapi. Komen KD101 sekarang!',
          captionSeo: 'Parutan duduk praktis untuk dapur.',
          hashtags: ['#parutankeripik', '#dapur'],
          pinnedComment: 'Komen KD101 atau cek nomor #001 di bio!',
          sceneCues: [
            { order: 1, visualFocus: 'slicing chips fast', durationSec: 4 },
            { order: 2, visualFocus: 'clean kitchen result', durationSec: 4 },
          ],
        },
        ttsProvider: 'edge-tts',
        ttsVoiceId: 'id-ID-GadisNeural',
      },
      {
        ttsProvider: new MockTtsProvider(),
        vpsApiUrl: 'http://127.0.0.1:3001',
        workerSecret: 'test-worker-secret-123456',
        fetchFn: mockFetch as unknown as typeof fetch,
        runFfmpeg: mockFfmpeg,
      }
    );

    expect(result.videoR2Key).toBe(`renders/${assetId}/final.mp4`);
    expect(mockFfmpeg).toHaveBeenCalledTimes(4);
    expect(existsSync(workDir)).toBe(false);
  });

  it('slices 6 panels from storyboardImageUrl into sequential 1080x1920 clips and cleans up workDir', async () => {
    const assetId = '550e8400-e29b-41d4-a716-446655440100';
    const workDir = join(tmpdir(), `ebieshop-render-${assetId}`);
    const mockFfmpeg = vi.fn(async (args: string[]) => {
      const outPath = args.at(-1);
      if (outPath) {
        await writeFile(outPath, Buffer.from('mock-mp4-data'));
      }
    });
    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/v1/assets/upload-url')) {
        const body = JSON.parse(init?.body as string) as { fileName: string };
        return new Response(
          JSON.stringify({
            uploadUrl: `https://upload.test/${body.fileName}`,
            r2Key: `renders/${assetId}/${body.fileName}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.startsWith('https://upload.test/')) {
        return new Response('', { status: 200 });
      }
      if (urlStr.includes('/api/v1/assets/local-file/storyboards/')) {
        return new Response(Buffer.from('fake-storyboard-grid-jpeg'), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response('', { status: 404 });
    });

    const result = await processLocalVideoRender(
      {
        contentAssetId: assetId,
        productId: '550e8400-e29b-41d4-a716-446655440001',
        rawMediaDir: join(tmpdir(), `missing-raw-${assetId}`),
        storyboardImageUrl: `/api/v1/assets/local-file/storyboards/${assetId}/storyboard-grid.jpg`,
        scriptJson: {
          hook: 'Capek dapur berantakan?',
          scriptVoiceover: 'Pakai rak ini aja biar rapi. Komen RAK01 sekarang!',
          captionSeo: 'Rak dapur praktis.',
          hashtags: ['#rakdapur'],
          pinnedComment: 'Komen RAK01 atau cek nomor #001 di bio!',
          sceneCues: [
            { order: 1, visualFocus: 'scene 1', doodleText: 'Cute 1', durationSec: 3 },
            { order: 2, visualFocus: 'scene 2', doodleText: 'Cute 2', durationSec: 3 },
            { order: 3, visualFocus: 'scene 3', doodleText: 'Cute 3', durationSec: 3 },
            { order: 4, visualFocus: 'scene 4', doodleText: 'Cute 4', durationSec: 3 },
            { order: 5, visualFocus: 'scene 5', doodleText: 'Cute 5', durationSec: 3 },
            { order: 6, visualFocus: 'scene 6', doodleText: 'Cute 6', durationSec: 3 },
          ],
        },
        ttsProvider: 'edge-tts',
        ttsVoiceId: 'id-ID-GadisNeural',
      },
      {
        ttsProvider: new MockTtsProvider(),
        vpsApiUrl: 'http://127.0.0.1:3001',
        workerSecret: 'test-worker-secret-123456',
        fetchFn: mockFetch as unknown as typeof fetch,
        runFfmpeg: mockFfmpeg,
      }
    );

    expect(result.videoR2Key).toBe(`renders/${assetId}/final.mp4`);
    // 6 panel slices + 1 final stitch = 7 ffmpeg invocations
    expect(mockFfmpeg).toHaveBeenCalledTimes(7);
    const firstPanelArgs = mockFfmpeg.mock.calls[0]?.[0]?.join(' ') ?? '';
    expect(firstPanelArgs).toContain('crop=iw/2:ih/3:0*(iw/2):0*(ih/3)');
    expect(existsSync(workDir)).toBe(false);
  });
});
