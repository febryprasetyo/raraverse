import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeHumanJitterMs,
  detectAuthChallenge,
  NeedsManualLoginError,
  validateStorageStateFile,
} from '../playwright/session-guard.js';

describe('Playwright Session Guard & Fail-Closed Protection', () => {
  it('fails closed to NeedsManualLoginError when redirected to login or CAPTCHA appears', () => {
    expect(() =>
      detectAuthChallenge({
        url: 'https://seller.tiktok.com/account/login?redirect=/studio',
        pageText: 'Sign in to TikTok Studio',
      })
    ).toThrow(NeedsManualLoginError);

    expect(() =>
      detectAuthChallenge({
        url: 'https://creator.shopee.co.id/upload',
        pageText: 'Please complete the security verification captcha to continue',
      })
    ).toThrow(NeedsManualLoginError);

    expect(() =>
      detectAuthChallenge({
        url: 'https://creator.shopee.co.id/upload',
        pageText: 'Upload Video Shopee',
      })
    ).not.toThrow();
  });

  it('computes human-like jitter delay within [800, 2500] ms', () => {
    for (let i = 0; i < 20; i += 1) {
      const delay = computeHumanJitterMs(800, 2500);
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });

  it('validates existence and structure of storageState.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ebieshop-pw-'));
    try {
      const missingPath = join(dir, 'missing.json');
      await expect(validateStorageStateFile(missingPath)).rejects.toThrow(
        NeedsManualLoginError
      );

      const invalidPath = join(dir, 'invalid.json');
      await writeFile(invalidPath, '{"foo": "bar"}', 'utf-8');
      await expect(validateStorageStateFile(invalidPath)).rejects.toThrow(
        NeedsManualLoginError
      );

      const validPath = join(dir, 'storageState.shopee.json');
      await writeFile(
        validPath,
        JSON.stringify({ cookies: [{ name: 'SPC_EC', value: 'abc' }], origins: [] }),
        'utf-8'
      );
      await expect(validateStorageStateFile(validPath)).resolves.toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
