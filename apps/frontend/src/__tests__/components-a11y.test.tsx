import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentAsset, Product, WeeklyEvaluationReport } from '@ebieshop/shared';
import { AnalyticsMatrix } from '../components/analytics-matrix';
import { ContentStudio } from '../components/content-studio';
import { DashboardOverviewContent } from '../components/dashboard-overview';

afterEach(() => {
  cleanup();
});

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
  affiliateUrls: { shopeeShortlink: 'https://shope.ee/mock-rak01' },
  kalodataSnapshot: null,
  rawMediaDir: 'raw_media_dir/550e8400-e29b-41d4-a716-446655440001',
  rawMediaClipCount: 4,
  status: 'ACTIVE',
  createdAt: '2026-11-16T07:00:00.000Z',
  updatedAt: '2026-11-16T07:00:00.000Z',
};

const sampleAsset: ContentAsset = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  productId: sampleProduct.id,
  llmProvider: 'gemini:gemini-2.5-flash',
  ttsProvider: 'edge-tts',
  ttsVoiceId: 'id-ID-GadisNeural',
  scriptJson: {
    hook: 'Dapur sempit makin rapi pakai rak ini!',
    scriptVoiceover: 'Komen RAK01 sekarang untuk link produk resmi!',
    captionSeo: 'Rak dapur estetik #rakdapur',
    hashtags: ['#rakdapur'],
    pinnedComment: 'Komen RAK01 atau cek #001 di bio!',
    sceneCues: [
      { order: 1, visualFocus: 'hook_problem', durationSec: 3 },
      { order: 2, visualFocus: 'before_after', durationSec: 5 },
    ],
  },
  audioR2Key: null,
  subtitleR2Key: null,
  videoR2Key: 'renders/asset-10/final.mp4',
  videoSha256: null,
  durationSec: 18,
  resolution: '1080x1920',
  status: 'PENDING_REVIEW',
  rejectionReason: null,
};

const sampleReport: WeeklyEvaluationReport = {
  weekStartDate: '2026-11-10T00:00:00.000Z',
  generatedAt: '2026-11-16T20:00:00.000Z',
  items: [
    {
      productId: sampleProduct.id,
      productName: sampleProduct.name,
      triggerKeyword: 'RAK01',
      videosPublished: 4,
      totalViews: 18500,
      totalTriggerComments: 92,
      totalDmSent: 90,
      estimatedClicks: 64,
      estimatedCommissionIdr: 320000,
      recommendation: 'SCALE',
      operatorDecision: 'PENDING',
    },
  ],
};

describe('Frontend Components & WCAG 2.2 AA Accessibility', () => {
  it('renders all 4 UX states in DashboardOverviewContent and passes axe-core', async () => {
    const { rerender, container } = render(
      <DashboardOverviewContent state="loading" data={null} />
    );
    expect(screen.getByRole('status').textContent).toContain('Memuat analitik Revenlo');

    rerender(<DashboardOverviewContent state="empty" data={null} />);
    expect(screen.getByText('Belum ada produk atau kampanye aktif')).toBeTruthy();

    const onRetry = vi.fn();
    rerender(
      <DashboardOverviewContent
        state="error"
        data={null}
        errorMsg="Timeout"
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Coba Lagi' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <DashboardOverviewContent
        state="success"
        data={{
          products: [sampleProduct],
          assets: [sampleAsset],
          jobs: [],
          dmLogs: [],
        }}
      />
    );
    expect(screen.getByText('Rak Bumbu Dapur 2 Tingkat')).toBeTruthy();

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('toggles 9:16 safe-zone overlay in ContentStudio and passes axe-core', async () => {
    const { container } = render(
      <ContentStudio
        products={[sampleProduct]}
        assets={[sampleAsset]}
        loading={false}
        onRetry={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Sembunyikan Safe-Zone/i });
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Overlay Safe Zone TikTok dan Reels')).toBeTruthy();

    fireEvent.click(toggleBtn);
    expect(screen.queryByLabelText('Overlay Safe Zone TikTok dan Reels')).toBeNull();

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('triggers one-click action in AnalyticsMatrix and passes axe-core', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AnalyticsMatrix
        report={sampleReport}
        loading={false}
        onRetry={vi.fn()}
        onApplyRecommendation={onApply}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Drop Produk' }));
    expect(onApply).toHaveBeenCalledWith(sampleProduct.id, 'DROP');

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });
});
