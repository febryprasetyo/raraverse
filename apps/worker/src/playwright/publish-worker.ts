import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
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

async function fillCaptionAndTagProduct(
  page: Page,
  job: PublishJobPayload,
  platformKey: 'shopee' | 'tiktok'
): Promise<void> {
  const captionSelector =
    platformKey === 'shopee'
      ? 'textarea[placeholder*="caption" i], div[contenteditable="true"]'
      : 'div[contenteditable="true"]';
  const captionInput = page.locator(captionSelector).first();
  if ((await captionInput.count()) > 0) {
    await captionInput.click();
    await waitHumanJitter();
    await captionInput.fill(job.captionSeo);
    await waitHumanJitter();
  }

  const productSearch = job.tiktokProductId ?? job.productName;
  const addProductBtn = page
    .getByRole('button', { name: /tambah produk|add product|product/i })
    .first();
  if ((await addProductBtn.count()) > 0 && productSearch) {
    await addProductBtn.click();
    await waitHumanJitter();
    const searchInput = page.locator('input[type="search"], input[placeholder*="cari" i]').first();
    if ((await searchInput.count()) > 0) {
      await searchInput.fill(productSearch);
      await waitHumanJitter();
    }
  }
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

    const browser = await chromium.launch({ headless: deps.headless });
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

      await fillCaptionAndTagProduct(page, job, platformKey);

      const publishBtn = page
        .getByRole('button', { name: /publish|posting|unggah/i })
        .first();
      if ((await publishBtn.count()) > 0) {
        await publishBtn.click();
        await waitHumanJitter();
      }

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
