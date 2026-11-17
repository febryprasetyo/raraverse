import { describe, it, expect } from 'vitest';
import {
  loadMockKalodataCandidates,
  loadMockProducts,
  loadMockScriptGeneratorOutput,
  loadMockContentAssets,
  loadMockPublishJobs,
  loadMockMetaWebhookEvents,
  loadMockDmLogs,
  loadMockWeeklyEvaluation,
  resolveDataSourceMode,
} from '../index.js';

describe('@ebieshop/mocks centralized JSON contract', () => {
  it('loads and validates all mock JSON files from packages/mocks/json/', () => {
    const candidates = loadMockKalodataCandidates();
    expect(candidates.length).toBeGreaterThan(0);

    const products = loadMockProducts();
    expect(products.some((p) => p.triggerKeyword === 'RAK01')).toBe(true);

    const script = loadMockScriptGeneratorOutput();
    expect(script.hook.length).toBeGreaterThan(5);

    const assets = loadMockContentAssets();
    expect(assets[0]?.resolution).toBe('1080x1920');

    const jobs = loadMockPublishJobs();
    expect(jobs.length).toBeGreaterThan(0);

    const webhookEvents = loadMockMetaWebhookEvents();
    expect(webhookEvents[0]?.object).toBe('instagram');

    const dmLogs = loadMockDmLogs();
    expect(dmLogs[0]?.matchedKeyword).toBe('RAK01');

    const weekly = loadMockWeeklyEvaluation();
    expect(weekly.items.length).toBeGreaterThan(0);
  });

  it('resolves data source mode and fails fast in production when mock is active', () => {
    expect(
      resolveDataSourceMode({
        nodeEnv: 'development',
        globalMode: 'mock',
      })
    ).toBe('mock');

    expect(
      resolveDataSourceMode({
        nodeEnv: 'development',
        globalMode: 'mock',
        serviceOverride: 'real',
      })
    ).toBe('real');

    expect(() =>
      resolveDataSourceMode({
        nodeEnv: 'production',
        globalMode: 'mock',
      })
    ).toThrow(/DATA_SOURCE_MODE=mock is forbidden in production/);

    expect(
      resolveDataSourceMode({
        nodeEnv: 'production',
        globalMode: 'real',
      })
    ).toBe('real');
  });
});
