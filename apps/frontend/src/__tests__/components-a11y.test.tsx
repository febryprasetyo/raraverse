import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AffiliateLink,
  ContentAsset,
  LnkBioMetricsSnapshot,
  LnkBioOverview,
  LnkBioSyncLog,
  Product,
  WeeklyEvaluationReport,
} from '@ebieshop/shared';
import { AnalyticsMatrix } from '../components/analytics-matrix';
import { PRODUCT_SUB_ITEMS } from '../components/app-shell';
import { ContentStudio } from '../components/content-studio';
import { DashboardOverviewContent } from '../components/dashboard-overview';
import { LnkBioManager } from '../components/lnkbio-manager';
import { ThreadsManager } from '../components/threads-manager';
import { ProductsManager } from '../components/products-manager';

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
    expect(screen.getByRole('status').textContent).toContain('Memuat analitik EBIESHOP');

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

  it('filters products to CURATED/ACTIVE, hides removed sections, and supports Gemini Web GEO + MP4 upload without a11y violations', async () => {
    const onGenerateStoryboard = vi.fn().mockResolvedValue(undefined);
    const curatedProduct: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Botol Minum Estetik 1L',
      status: 'CURATED',
      triggerKeyword: 'BOTOL1',
      biolinkNumber: '002',
    };
    const candidateProduct: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'Produk Kandidat Tersembunyi',
      status: 'CANDIDATE',
      triggerKeyword: 'CAND1',
      biolinkNumber: '003',
    };
    const droppedProduct: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440004',
      name: 'Produk Dropped Tersembunyi',
      status: 'DROPPED',
      triggerKeyword: 'DROP1',
      biolinkNumber: '004',
    };

    const storyboardAsset: ContentAsset = {
      ...sampleAsset,
      videoR2Key: null,
      status: 'GENERATING_SCRIPT',
      scriptJson: {
        ...sampleAsset.scriptJson,
        storyboardPrompt:
          'Buatkan storyboardnya 6 scene untuk produk "Rak Bumbu Dapur 2 Tingkat", buat seolah DIATAS meja dengan 2 tangan memakai baju rajut warna cream, doodle super cute, pertahankan keaslian produk ya.',
        captionSeo:
          'Rekomendasi Rak Bumbu Dapur 2 Tingkat anti karat untuk dapur rapi under 100rb.',
      },
    };

    const { container } = render(
      <ContentStudio
        products={[candidateProduct, sampleProduct, curatedProduct, droppedProduct]}
        assets={[storyboardAsset]}
        loading={false}
        onRetry={vi.fn()}
        onGenerateStoryboard={onGenerateStoryboard}
        onUploadRenderedVideo={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
      />
    );

    const productSelect = screen.getByLabelText(
      /Pilih Produk \(Curated \/ Active\)/i
    ) as HTMLSelectElement;
    const optionTexts = Array.from(productSelect.options).map((opt) => opt.text);
    expect(optionTexts.some((t) => t.includes('Rak Bumbu Dapur 2 Tingkat'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('Botol Minum Estetik 1L'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('Produk Kandidat Tersembunyi'))).toBe(false);
    expect(optionTexts.some((t) => t.includes('Produk Dropped Tersembunyi'))).toBe(false);

    // Removed sections must NOT be present
    expect(screen.queryByText(/Daftar Slot Konten/i)).toBeNull();
    expect(screen.queryByLabelText(/Upload Gambar Storyboard/i)).toBeNull();
    expect(screen.queryByText(/Scene Cues/i)).toBeNull();
    expect(screen.queryByText(/Voiceover Transcript/i)).toBeNull();
    expect(screen.queryByText(/^Hook$/i)).toBeNull();

    // New streamlined Studio controls
    expect(
      screen.getByRole('button', { name: 'Regenerate Prompt & Copywriting GEO' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salin Prompt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salin Caption & Hashtag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salin Pinned Comment' })).toBeTruthy();
    expect(screen.getByLabelText(/Upload Video Jadi \(\.MP4/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate Prompt & Copywriting GEO' }));
    expect(onGenerateStoryboard).toHaveBeenCalledTimes(1);

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

  it('renders Product Discovery dual tables, Produk Kurasi view without status filter buttons, pagination, and passes axe-core', async () => {
    const sampleCandidate = {
      kalodataProductId: '1736805940517045609',
      name: 'Serum Hyaluronic Barrier Repair 30ml',
      niche: 'skincare',
      priceIdr: 129000,
      rating: 4.9,
      commissionRatePct: 12,
      isCommissionXtra: true,
      isOfficialStore: true,
      weeklyRevenueIdr: 950000000,
      weeklyUnitsSold: 7360,
      unitPriceExactIdr: 129000,
      revenueExactIdr: 950000000,
      revenueGrowthRatePct: 18.4,
      liveRevenueIdr: 250000000,
      videoRevenueIdr: 680000000,
      showcaseRevenueIdr: 20000000,
      sellerName: 'Glowlab Indonesia Official',
      referenceVideoUrls: [],
      referenceVideos: [],
    };
    const onSyncKalodata = vi.fn().mockResolvedValue({
      syncedCount: 1,
      candidates: [sampleCandidate],
    });
    const onDeleteProduct = vi.fn().mockResolvedValue(undefined);
    const onUpdateProduct = vi.fn().mockResolvedValue(undefined);

    const existingCandidate: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440100',
      kalodataProductId: '1736000000000000001',
      niche: 'skincare',
      name: 'Toner Centella Calming Lama',
      status: 'CANDIDATE',
      biolinkNumber: 'C-001',
      triggerKeyword: 'KD101',
    };

    const skincareWithVideos: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440101',
      kalodataProductId: '1736576509412607102',
      niche: 'skincare',
      name: '11.11 SALE PAKET NEW GLOWING BOOSTER LS SKINCARE (ELSTM)',
      priceIdr: 91516,
      rating: 4.9,
      commissionRatePct: 15,
      isCommissionXtra: true,
      isOfficialStore: true,
      status: 'CURATED',
      biolinkNumber: '011',
      triggerKeyword: 'LSSKIN1',
      kalodataSnapshot: {
        imageUrl: 'https://example.com/ls-skincare.jpg',
        weeklyRevenueIdr: 1607486502,
        weeklyUnitsSold: 17565,
        unitPriceExactIdr: 91516.45,
        revenueExactIdr: 1607486501.82,
        revenueGrowthRatePct: 9.57,
        liveRevenueIdr: 375033343.21,
        videoRevenueIdr: 1232361834.41,
        showcaseRevenueIdr: 91324.2,
        launchDate: '2026-08-15',
        sellerId: '7494524362275129470',
        sellerName: 'LS SKINCARE REBORNOFFICIAL',
        skuCount: '1',
        priCategory: { categoryId: '601450', categoryName: 'Perawatan & Kecantikan' },
        secCategory: { categoryId: '848776', categoryName: 'Skincare' },
        terCategory: { categoryId: '601611', categoryName: 'Kit Perawatan Kulit' },
        referenceVideoUrls: [
          'https://www.tiktok.com/@hilkaazzura/video/7685958821180624135',
        ],
        referenceVideos: [
          {
            videoId: '7685958821180624135',
            videoTitle: 'Membalas @chaspallspill #lsskincare #skincareroutine',
            belongedCreatorId: '7220799642455114778',
            belongedCreatorHandle: 'hilkaazzura',
            videoUrl: 'https://www.tiktok.com/@hilkaazzura/video/7685958821180624135',
            revenue: 229871437.91,
            views: 615198,
            revenueGrowthRate: -0.13,
            adsRoas: 2.85,
            diggCount: 8463,
            shareCount: 651,
            commentCount: 991,
            adRevenueRatio: 80,
            adViewRatio: 97.75,
            creatorDebut: '2025-03-27',
            ad: 1,
            aiVideo: 0,
            publishDate: '2026/09/16 09:45:44',
          },
        ],
        syncedAt: '2026-11-17T09:53:58.319Z',
      },
    };

    const skincareAbove100kNoVideos: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440102',
      kalodataProductId: '1736805940517045607',
      niche: 'skincare',
      name: 'Complete Package - Puragen hybright-XT | Daviena Skincare',
      priceIdr: 425778,
      rating: 4.9,
      commissionRatePct: 5,
      isCommissionXtra: false,
      isOfficialStore: true,
      status: 'ACTIVE',
      biolinkNumber: '012',
      triggerKeyword: 'DAV12',
      kalodataSnapshot: {
        weeklyRevenueIdr: 1453604477,
        weeklyUnitsSold: 3414,
        unitPriceExactIdr: 425777.53,
        revenueExactIdr: 1453604476.86,
        revenueGrowthRatePct: 30.3,
        liveRevenueIdr: 396481823.62,
        videoRevenueIdr: 1057122653.23,
        showcaseRevenueIdr: 0,
        launchDate: '2026-08-01',
        sellerId: '7494502404387277159',
        sellerName: 'Daviena Skincare Official',
        skuCount: '3',
        referenceVideoUrls: [],
        referenceVideos: [],
        syncedAt: '2026-11-17T09:53:58.319Z',
      },
    };

    const { container } = render(
      <ProductsManager
        initialMode="discovery"
        products={[existingCandidate, skincareWithVideos, skincareAbove100kNoVideos]}
        loading={false}
        onRetry={vi.fn()}
        onSyncKalodata={onSyncKalodata}
        onDeleteProduct={onDeleteProduct}
        onUpdateProduct={onUpdateProduct}
      />
    );

    // Status filter buttons (ALL/CANDIDATE/CURATED/...) must be removed
    expect(screen.queryByRole('group', { name: /Filter status produk/i })).toBeNull();

    // Product Discovery shows saved candidates table initially
    expect(screen.getByText('Toner Centella Calming Lama')).toBeTruthy();
    expect(screen.queryByText('11.11 SALE PAKET NEW GLOWING BOOSTER LS SKINCARE (ELSTM)')).toBeNull();

    // Searching Kalodata saves immediately (previewOnly: false) and shows BOTH tables separated
    fireEvent.click(screen.getByRole('button', { name: /Cari & Simpan Kalodata/i }));
    expect(onSyncKalodata).toHaveBeenCalledWith(
      expect.objectContaining({
        niche: 'skincare',
        maxPriceIdr: 1_000_000_000,
        previewOnly: false,
      })
    );
    expect(await screen.findByText(/Hasil Pencarian Baru: "skincare"/i)).toBeTruthy();
    expect(screen.getByText('Serum Hyaluronic Barrier Repair 30ml')).toBeTruthy();
    expect(
      screen.getByText(/Data Discovery Tersimpan \(Sudah Di-get Sebelumnya\)/i)
    ).toBeTruthy();
    expect(screen.getByText('Toner Centella Calming Lama')).toBeTruthy();

    // Audit dual-table accessibility
    const discoveryAxe = await axe.run(container);
    expect(discoveryAxe.violations).toEqual([]);

    // Switch to Produk Kurasi sub-menu
    fireEvent.click(screen.getByRole('button', { name: /Produk Kurasi/i }));
    expect(screen.queryByText('Toner Centella Calming Lama')).toBeNull();

    // Kategori L1 compact select dropdown (no overflowing tabs)
    const categorySelect = screen.getByLabelText(
      /Filter Kategori L1 Kurasi/i
    ) as HTMLSelectElement;
    const catOptionTexts = Array.from(categorySelect.options).map((o) => o.text);
    expect(catOptionTexts).toContain('Semua Kategori (2)');
    expect(catOptionTexts).toContain('Perawatan & Kecantikan (1)');

    // Table headers matching Kalodata layout
    expect(screen.getByRole('columnheader', { name: /Info Produk/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^Pendapatan$/i })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /Tren & Sumber Pendapatan/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Tingkat Pertumbuhan/i })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /^Penjualan$/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Video GMV Tertinggi/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Penilaian Produk/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Harga Jual Rata-rata/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Tingkat Komisi/i })).toBeTruthy();

    // Exact channel labels on main table & detail panel
    expect(screen.getAllByText(/Pendapatan Livestream:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pendapatan Video:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pendapatan Kartu Produk:/i).length).toBeGreaterThan(0);

    // Empty video fallback message from Kalodata reference
    expect(screen.getByText(/Tidak ada video terkait yang ditemukan/i)).toBeTruthy();

    // Info Produk row must stay clean without clip count or Biolink/Keyword clutter
    expect(screen.queryByText(/Biolink #011/i)).toBeNull();
    expect(screen.queryByText(/4 klip/i)).toBeNull();

    // Action buttons are hidden behind 3-dot menu and icon-only when opened
    expect(screen.queryByRole('button', { name: /^Detail Product$/i })).toBeNull();
    const firstMenuBtn = screen.getByRole('button', {
      name: /Menu aksi 11\.11 SALE PAKET NEW GLOWING BOOSTER/i,
    });
    fireEvent.click(firstMenuBtn);

    const detailBtn = screen.getByRole('button', { name: /^Detail Product$/i });
    expect(detailBtn.textContent).toBe('');
    fireEvent.click(detailBtn);

    // Verify all product and video API fields (plus curation metadata) are displayed inside Detail Product
    expect(screen.getByText(/LSSKIN1 • Biolink #011/)).toBeTruthy();
    expect(screen.getByText('1736576509412607102')).toBeTruthy();
    expect(screen.getByText('7494524362275129470')).toBeTruthy();
    expect(screen.getByText('2026-08-15')).toBeTruthy();
    expect(screen.getByText('7685958821180624135')).toBeTruthy();
    expect(screen.getByText(/7220799642455114778/)).toBeTruthy();
    expect(screen.getByText(/2\.85|2,85/)).toBeTruthy();
    expect(screen.getByText(/8\.463/)).toBeTruthy();
    expect(screen.getByText(/97,75%/)).toBeTruthy();
    expect(screen.getByText(/2025-03-27/)).toBeTruthy();
    expect(screen.getByText(/2026\/09\/16 09:45:44/)).toBeTruthy();

    // Re-open 3-dot menu and trigger icon-only Jeda (PAUSED) status transition
    fireEvent.click(firstMenuBtn);
    const pauseBtn = screen.getByRole('button', { name: /^Jeda$/i });
    expect(pauseBtn.textContent).toBe('');
    fireEvent.click(pauseBtn);
    expect(onUpdateProduct).toHaveBeenCalledWith(skincareWithVideos.id, { status: 'PAUSED' });

    // Re-open 3-dot menu so axe-core also audits the open toolbar popover
    fireEvent.click(firstMenuBtn);

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('supports Lnk.Bio curation flow, table pagination, and Post ke Lnk.Bio without a11y violations', async () => {
    const candidateProduct: Product = {
      ...sampleProduct,
      id: '550e8400-e29b-41d4-a716-446655440201',
      name: 'Serum Vitamin C Brightening 20ml',
      niche: 'skincare',
      status: 'CANDIDATE',
      biolinkNumber: 'C-001',
      triggerKeyword: 'CANDIDATE_001',
      affiliateUrls: {
        shopeeShortlink: 'https://shope.ee/serum-vit-c',
      },
    };
    const extraCandidates: Product[] = Array.from({ length: 11 }, (_, idx) => ({
      ...candidateProduct,
      id: `550e8400-e29b-41d4-a716-4466554403${String(idx).padStart(2, '0')}`,
      kalodataProductId: `kd_page_${idx}`,
      name: `Produk Kandidat Halaman ${idx + 2}`,
      biolinkNumber: `C-${String(idx + 2).padStart(3, '0')}`,
      triggerKeyword: `KDC${idx + 10}`,
    }));
    const curatedSyncedProduct: Product = {
      ...candidateProduct,
      id: '550e8400-e29b-41d4-a716-446655440202',
      name: 'Moisturizer Ceramide Barrier',
      status: 'CURATED',
      biolinkNumber: '002',
      triggerKeyword: 'CERAMIDE2',
      affiliateUrls: {
        shopeeShortlink: 'https://shope.ee/ceramide',
        lnkBioId: 'lnk_778899',
      },
    };

    const onUpdateProduct = vi.fn().mockResolvedValue({
      ...candidateProduct,
      status: 'CURATED',
      biolinkNumber: '003',
      triggerKeyword: 'VITC3',
      affiliateUrls: {
        shopeeShortlink: 'https://shope.ee/serum-vit-c',
        lnkBioId: 'lnk_990011',
      },
    });
    const onSyncLnkBio = vi.fn().mockResolvedValue(curatedSyncedProduct);

    const { container } = render(
      <ProductsManager
        initialMode="discovery"
        products={[candidateProduct, ...extraCandidates, curatedSyncedProduct]}
        loading={false}
        onRetry={vi.fn()}
        onSyncKalodata={vi.fn()}
        onUpdateProduct={onUpdateProduct}
        onSyncLnkBio={onSyncLnkBio}
      />
    );

    // Pagination on Data Discovery Tersimpan (12 candidate items, default 10/page)
    expect(screen.getByText('Serum Vitamin C Brightening 20ml')).toBeTruthy();
    expect(screen.queryByText('Produk Kandidat Halaman 12')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Halaman berikutnya saved-discovery/i }));
    expect(screen.getByText('Produk Kandidat Halaman 12')).toBeTruthy();
    expect(screen.queryByText('Serum Vitamin C Brightening 20ml')).toBeNull();

    // Change page size to 15 to show all 12 items on page 1
    fireEvent.change(screen.getByLabelText(/Baris per halaman saved-discovery/i), {
      target: { value: '15' },
    });
    expect(screen.getByText('Serum Vitamin C Brightening 20ml')).toBeTruthy();
    expect(screen.getByText('Produk Kandidat Halaman 12')).toBeTruthy();

    // Open 3-dot menu for CANDIDATE product and open Edit Kurasi drawer
    fireEvent.click(
      screen.getByRole('button', { name: /Menu aksi Serum Vitamin C Brightening 20ml/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Edit Kurasi$/i }));

    // CANDIDATE drawer only asks for Shopee Shortlink; Keyword (SEO+GEO Gemini) & Biolink are auto-generated
    expect(screen.queryByLabelText(/Nomor Biolink/i)).toBeNull();
    expect(screen.queryByLabelText(/Trigger Keyword/i)).toBeNull();
    expect(screen.getByText(/Trigger Keyword: Otomatis \(SEO \+ GEO Gemini\)/i)).toBeTruthy();

    const shopeeInput = screen.getByLabelText(/Shopee Shortlink/i) as HTMLInputElement;
    fireEvent.change(shopeeInput, { target: { value: 'https://shope.ee/serum-vit-c-new' } });

    // Promote CANDIDATE to CURATED with Shopee Shortlink only (omitting triggerKeyword & biolinkNumber)
    fireEvent.click(
      screen.getByRole('button', { name: /Masukkan ke Produk Kurasi \(Auto Keyword & Lnk\.Bio\)/i })
    );
    expect(onUpdateProduct).toHaveBeenCalledWith(
      candidateProduct.id,
      expect.objectContaining({
        status: 'CURATED',
        affiliateUrls: expect.objectContaining({
          shopeeShortlink: 'https://shope.ee/serum-vit-c-new',
        }),
      })
    );
    const updateCallArg = onUpdateProduct.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('biolinkNumber' in updateCallArg).toBe(false);
    expect('triggerKeyword' in updateCallArg).toBe(false);

    // Switch to Produk Kurasi tab and verify full 4-field editor + Post ke Lnk.Bio on curated product
    fireEvent.click(screen.getByRole('button', { name: /Produk Kurasi/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Menu aksi Moisturizer Ceramide Barrier/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Edit Kurasi$/i }));
    expect(screen.getByLabelText(/Trigger Keyword/i)).toBeTruthy();
    expect(screen.getByLabelText(/Nomor Biolink/i)).toBeTruthy();
    expect(screen.getByText(/Lnk\.Bio Tersinkron • Biolink #002 \(ID: lnk_778899\)/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Post ke Lnk\.Bio/i }));
    expect(onSyncLnkBio).toHaveBeenCalledWith(curatedSyncedProduct.id);

    // Open Detail Product on curatedSyncedProduct and verify lnkBioId is displayed
    fireEvent.click(screen.getByText('Moisturizer Ceramide Barrier'));
    expect(screen.getByText(/Lnk\.Bio ID: lnk_778899/)).toBeTruthy();

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('renders LnkBioManager with operator-confirmed delete, bulk reorder, schedule editor, sync logs, and passes axe-core', async () => {
    expect(PRODUCT_SUB_ITEMS.some((i) => i.href === '/products/lnkbio')).toBe(true);

    const sampleLink: AffiliateLink = {
      id: '660e8400-e29b-41d4-a716-446655440001',
      productId: sampleProduct.id,
      lnkBioId: 'mock_lnkbio_001',
      biolinkNumber: '001',
      redirectCode: 'RAK01',
      title: '#001 - Rak Bumbu Dapur 2 Tingkat',
      targetUrl: 'https://shope.ee/mock-rak01',
      trackedUrl: 'https://ebieshop.id/r/RAK01?utm_source=lnkbio',
      imageUrl: null,
      groupId: 'grp_dapur_01',
      groupName: 'Peralatan Dapur',
      position: 1,
      scheduleFrom: null,
      scheduleTo: null,
      syncStatus: 'SYNCED',
      isActive: true,
      internalClicks: 184,
      lnkBioClicks: 162,
      lastSyncedAt: '2026-11-18T08:00:00.000Z',
      createdAt: '2026-11-16T07:00:00.000Z',
      updatedAt: '2026-11-18T08:00:00.000Z',
      productStatus: 'PAUSED',
      readyForDelete: true,
      performanceScore: 2085,
    };

    const overview: LnkBioOverview = {
      profile: {
        accountId: 'mock_acc',
        username: 'ebieshop.id',
        planTier: 'MINI',
        supportsGroups: true,
        connected: true,
        tokenStatus: 'MOCK',
        expiresAt: '2026-12-18T00:00:00.000Z',
      },
      groups: [{ groupId: 'grp_dapur_01', groupName: 'Peralatan Dapur', linkCount: 1 }],
      links: [sampleLink],
      recommendedOrder: [sampleProduct.id],
      readyToDeleteCount: 1,
    };

    const logs: LnkBioSyncLog[] = [
      {
        id: '770e8400-e29b-41d4-a716-446655440001',
        productId: sampleProduct.id,
        affiliateLinkId: sampleLink.id,
        operation: 'ADD',
        status: 'SUCCESS',
        httpStatus: 200,
        requestPayload: { title: '#001 - Rak Bumbu' },
        responsePayload: { lnkBioId: 'mock_lnkbio_001' },
        errorMessage: null,
        attemptCount: 1,
        durationMs: 120,
        createdAt: '2026-11-18T08:00:00.000Z',
      },
    ];

    const metrics: LnkBioMetricsSnapshot[] = [
      {
        id: '880e8400-e29b-41d4-a716-446655440001',
        productId: sampleProduct.id,
        affiliateLinkId: sampleLink.id,
        lnkBioId: 'mock_lnkbio_001',
        snapshotDate: '2026-11-18T08:00:00.000Z',
        lnkBioClicks: 162,
        internalRedirectClicks: 184,
        totalTrackedClicks: 184,
        ctrPct: 3.42,
        estimatedCommissionIdr: 245000,
        performanceScore: 2085,
        utmBreakdown: { lnkbio: 184 },
        createdAt: '2026-11-18T08:00:00.000Z',
      },
    ];

    const onSync = vi.fn().mockResolvedValue(undefined);
    const onUpdateLink = vi.fn().mockResolvedValue(undefined);
    const onDeleteLink = vi.fn().mockResolvedValue(undefined);
    const onReorder = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <LnkBioManager
        overview={overview}
        logs={logs}
        metrics={metrics}
        loading={false}
        onRetry={vi.fn()}
        onSync={onSync}
        onUpdateLink={onUpdateLink}
        onDeleteLink={onDeleteLink}
        onReorder={onReorder}
      />
    );

    expect(screen.queryByText(/Akun & OAuth 2\.0 Lnk\.Bio/i)).toBeNull();
    expect(screen.getAllByText(/Siap Dihapus/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Sinkronkan Lnk\.Bio/i }));
    await waitFor(() => {
      expect(onSync).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Sinkronisasi daftar Lnk\.Bio/i)).toBeTruthy();
    });

    // Open Edit Jadwal modal and submit RFC 3339 schedule update
    fireEvent.click(screen.getByRole('button', { name: /Edit jadwal dan grup/i }));
    const titleInput = screen.getByLabelText(/Judul Tautan di Lnk\.Bio/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: '#001 - Rak Bumbu Flash Sale' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan & Update ke Lnk\.Bio/i }));
    await waitFor(() => {
      expect(onUpdateLink).toHaveBeenCalledWith(
        sampleProduct.id,
        expect.objectContaining({
          title: '#001 - Rak Bumbu Flash Sale',
          groupId: 'grp_dapur_01',
        })
      );
    });

    // Operator-confirmed Delete requires dialog confirmation
    fireEvent.click(screen.getByRole('button', { name: /Hapus dari Lnk\.Bio/i }));
    expect(onDeleteLink).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Konfirmasi Hapus Permanen/i }));
    await waitFor(() => {
      expect(onDeleteLink).toHaveBeenCalledWith(sampleProduct.id);
      expect(screen.getByText(/telah dihapus dari Lnk\.Bio/i)).toBeTruthy();
    });

    // Switch to Reorder tab and apply performance order
    fireEvent.click(screen.getByRole('tab', { name: /Bulk Reorder/i }));
    fireEvent.click(screen.getByRole('button', { name: /Terapkan Urutan ke Lnk\.Bio/i }));
    await waitFor(() => {
      expect(onReorder).toHaveBeenCalledWith([sampleProduct.id]);
      expect(screen.getByText(/Urutan tautan Lnk\.Bio berhasil diperbarui/i)).toBeTruthy();
    });

    // Switch to Sync Logs & Hybrid Analytics tab and run axe-core
    fireEvent.click(screen.getByRole('tab', { name: /Sync Logs & Hybrid Analytics/i }));
    expect(screen.getByText(/Audit Trail Sync Logs/i)).toBeTruthy();
    expect(screen.getByText(/Snapshot Analitik Hybrid/i)).toBeTruthy();

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('renders ThreadsManager, triggers App Token test, AI draft, and publish with zero axe-core violations', async () => {
    const onTestAppToken = vi.fn().mockResolvedValue(undefined);
    const onGenerateDraft = vi.fn().mockResolvedValue({
      rootText: 'Meja dapur berantakan? Pakai rak bumbu 2 tingkat ini!',
      replyText: 'Link resmi cek di sini: https://shope.ee/mock01',
      affiliateUrl: 'https://shope.ee/mock01',
      mediaUrl: null,
      resolvedMediaType: 'TEXT' as const,
    });
    const onPublishThread = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <ThreadsManager
        overview={{
          profile: {
            appId: '1811443116804615',
            userId: '25000112233',
            username: 'raraverse',
            displayName: 'raraverse',
            connected: true,
            hasUserToken: false,
            hasAppToken: true,
            tokenStatus: 'APP_TOKEN',
            expiresAt: null,
          },
          posts: [],
          logs: [],
        }}
        products={[sampleProduct]}
        loading={false}
        onRetry={vi.fn()}
        onTestAppToken={onTestAppToken}
        onStartUserOAuth={vi.fn().mockResolvedValue(undefined)}
        onConnectCode={vi.fn().mockResolvedValue(undefined)}
        onConnectAccessToken={vi.fn().mockResolvedValue(undefined)}
        onGenerateDraft={onGenerateDraft}
        onPublishThread={onPublishThread}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Test App Access Token/i })
    );
    await waitFor(() => {
      expect(onTestAppToken).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Buat Draf AI \(LLM\)/i }));
    await waitFor(() => {
      expect(onGenerateDraft).toHaveBeenCalledWith(sampleProduct.id, 'TEXT');
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Publish Chained Thread Live/i })
    );
    await waitFor(() => {
      expect(onPublishThread).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: sampleProduct.id,
          mediaType: 'TEXT',
        })
      );
    });

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });
});
