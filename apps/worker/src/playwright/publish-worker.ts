import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { PublishJobPayload } from '@ebieshop/shared';
import {
  detectAuthChallenge,
  validateStorageStateFile,
  waitHumanJitter,
} from './session-guard.js';

export interface PlaywrightPublishResult {
  publishJobId: string;
  platform: PublishJobPayload['platform'];
  status: 'PUBLISHED';
  publishedAt: string;
}

export interface PlaywrightPublishDeps {
  publicR2BaseUrl: string;
  headless: boolean;
  storageDir?: string;
  fetchFn?: typeof fetch;
}

export async function processPlaywrightPublish(
  job: PublishJobPayload,
  deps: PlaywrightPublishDeps
): Promise<PlaywrightPublishResult> {
  const platformKey = job.platform === 'SHOPEE_VIDEO' ? 'shopee' : 'tiktok';
  const storageStatePath = resolve(
    deps.storageDir ?? process.cwd(),
    `storageState.${platformKey}.json`
  );
  await validateStorageStateFile(storageStatePath);

  const workDir = join(tmpdir(), `ebieshop-pw-${job.publishJobId}`);
  await mkdir(workDir, { recursive: true });
  const localVideoPath = join(workDir, 'upload.mp4');
  const fetchFn = deps.fetchFn ?? fetch;

  try {
    const videoUrl = `${deps.publicR2BaseUrl.replace(/\/$/, '')}/${job.videoR2Key.replace(/^\/+/, '')}`;
    const res = await fetchFn(videoUrl);
    if (!res.ok) {
      throw new Error(`Failed to download video from R2 (${res.status})`);
    }
    await writeFile(localVideoPath, Buffer.from(await res.arrayBuffer()));

    const playwrightModuleName = 'playwright';
    const pw = (await import(playwrightModuleName)) as {
      chromium: {
        launch: (opts: { headless: boolean }) => Promise<{
          newContext: (opts: {
            storageState: string;
            viewport: { width: number; height: number };
          }) => Promise<{
            newPage: () => Promise<{
              goto: (url: string, opts?: { waitUntil?: string }) => Promise<void>;
              url: () => string;
              innerText: (selector: string) => Promise<string>;
              setInputFiles: (selector: string, files: string) => Promise<void>;
            }>;
          }>;
          close: () => Promise<void>;
        }>;
      };
    };

    const browser = await pw.chromium.launch({ headless: deps.headless });
    try {
      const context = await browser.newContext({
        storageState: storageStatePath,
        viewport: { width: 1366, height: 768 },
      });
      const page = await context.newPage();
      const targetUrl =
        platformKey === 'shopee'
          ? 'https://creator.shopee.co.id/upload'
          : 'https://www.tiktok.com/tiktokstudio/upload';

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await waitHumanJitter();

      const pageText = await page.innerText('body').catch(() => '');
      detectAuthChallenge({ url: page.url(), pageText });

      await page.setInputFiles('input[type="file"]', localVideoPath);
      await waitHumanJitter();

      return {
        publishJobId: job.publishJobId,
        platform: job.platform,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      };
    } finally {
      await browser.close();
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
