import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  products,
  contentAssets,
  publishJobs,
  dmLogs,
  oauthTokens,
  productMetricsWeekly,
  encryptToken,
  decryptToken,
} from '../index.js';

describe('@ebieshop/db schema and crypto', () => {
  it('defines all 6 core tables with expected unique constraints', () => {
    const productsCfg = getTableConfig(products);
    expect(productsCfg.name).toBe('products');
    expect(productsCfg.indexes.map((i) => i.config.name)).toContain(
      'products_trigger_keyword_uq'
    );
    expect(productsCfg.indexes.map((i) => i.config.name)).toContain(
      'products_biolink_number_uq'
    );

    const assetsCfg = getTableConfig(contentAssets);
    expect(assetsCfg.name).toBe('content_assets');
    expect(assetsCfg.indexes.map((i) => i.config.name)).toContain(
      'content_assets_video_sha256_uq'
    );

    const publishCfg = getTableConfig(publishJobs);
    expect(publishCfg.name).toBe('publish_jobs');
    expect(publishCfg.indexes.map((i) => i.config.name)).toContain(
      'publish_jobs_asset_platform_uq'
    );

    const dmCfg = getTableConfig(dmLogs);
    expect(dmCfg.name).toBe('dm_logs');
    expect(dmCfg.indexes.map((i) => i.config.name)).toContain(
      'dm_logs_comment_id_uq'
    );

    const oauthCfg = getTableConfig(oauthTokens);
    expect(oauthCfg.name).toBe('oauth_tokens');

    const weeklyCfg = getTableConfig(productMetricsWeekly);
    expect(weeklyCfg.name).toBe('product_metrics_weekly');
  });

  it('encrypts and decrypts OAuth tokens using AES-256-GCM and detects tampering', () => {
    const keyHex =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const plaintext = 'EAA_MOCK_LONG_LIVED_TOKEN_123456';

    const encrypted = encryptToken(plaintext, keyHex);
    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(encrypted.iv).toHaveLength(24);
    expect(encrypted.authTag).toHaveLength(32);

    const decrypted = decryptToken(encrypted, keyHex);
    expect(decrypted).toBe(plaintext);

    expect(() =>
      decryptToken(
        {
          ...encrypted,
          authTag: 'ffffffffffffffffffffffffffffffff',
        },
        keyHex
      )
    ).toThrow();
  });
});
