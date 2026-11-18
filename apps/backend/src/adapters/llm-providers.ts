import {
  ScriptGeneratorOutputSchema,
  type Product,
  type ScriptGeneratorOutput,
} from '@ebieshop/shared';
import { AppError } from '../errors.js';
import type { ILlmProvider, ThreadsCopyOutput } from './contracts.js';

export interface LlmProviderOptions {
  apiKey: string;
  model?: string;
  fetchFn?: typeof fetch;
}

const NICHE_STORYBOARD_ANGLES: Array<{
  keywords: string[];
  surfaceProps: string;
  sceneFocus: string;
  doodleIdeas: string;
}> = [
  {
    keywords: ['beauty', 'skincare', 'cosmetic', 'kecantikan', 'makeup', 'body', 'hair'],
    surfaceProps: 'meja kayu estetik hangat dengan cermin kecil dan pencahayaan soft morning light',
    sceneFocus: 'unboxing kemasan rapi, close-up tekstur/aplikator, demo pemakaian lembut di punggung tangan, dan pose hasil akhir rapi',
    doodleIdeas: '"Glow Up!", "Wajib Punya!", "Teksturnya Juara ✨", "Cek Keranjang"',
  },
  {
    keywords: ['home', 'living', 'kitchen', 'dapur', 'rumah', 'decor', 'botol', 'tumbler', 'minum'],
    surfaceProps: 'meja kayu estetik dengan taplak linen netral dan properti meja minimalis',
    sceneFocus: 'meja berantakan lalu dirapikan, tangan memutar/membuka detail tutup atau fitur utama, demo fungsi harian, dan tampilan estetik siap pakai',
    doodleIdeas: '"Auto Rapi!", "Praktis Banget ✨", "Estetik Parah!", "Solusi Harian"',
  },
  {
    keywords: ['tech', 'gadget', 'elektronik', 'electronic', 'audio', 'phone', 'aksesoris'],
    surfaceProps: 'meja kerja bersih tone hangat dengan keyboard minimalis dan pencahayaan studio lembut',
    sceneFocus: 'tampilan produk utuh, close-up tombol/port & detail material, demo koneksi/cara pakai instan, dan setup meja rapi',
    doodleIdeas: '"Sat-Set!", "Fitur Keren ⚡", "Wajib Coba!", "Anti Ribet"',
  },
  {
    keywords: ['fashion', 'tas', 'bag', 'baju', 'sepatu', 'hijab', 'apparel'],
    surfaceProps: 'meja display putih-cream bersih dengan properti majalah estetik',
    sceneFocus: 'flat-lay produk utuh, zoom serat bahan & jahitan, demo kompartemen/cara styling di meja, dan tampilan final siap OOTD',
    doodleIdeas: '"Cute Banget ♡", "Bahan Adem!", "Must Have ✨", "Auto Stylish"',
  },
];

function resolveStoryboardNicheAngle(product: Product) {
  const haystack = `${product.niche} ${product.name}`.toLowerCase();
  const matched = NICHE_STORYBOARD_ANGLES.find((entry) =>
    entry.keywords.some((kw) => haystack.includes(kw))
  );
  return (
    matched ?? {
      surfaceProps: 'meja bersih estetik tone cream hangat dengan properti pendukung yang rapi',
      sceneFocus:
        'perkenalan masalah/kebutuhan, zoom detail asli produk, demo fungsi utama di atas meja, bukti hasil pemakaian, dan close-up akhir siap checkout',
      doodleIdeas: `"Cute Banget ✨", "Solusi ${product.niche}!", "Asli Bagus!", "Komen ${product.triggerKeyword.toUpperCase()}"`,
    }
  );
}

export function buildDefaultStoryboardPrompt(product: Product): string {
  const angle = resolveStoryboardNicheAngle(product);
  const priceText = `Rp${product.priceIdr.toLocaleString('id-ID')}`;
  return [
    `Buatkan storyboardnya 6 scene untuk produk "${product.name}" (niche ${product.niche}, ${priceText}),`,
    `buat seolah DIATAS meja (${angle.surfaceProps}) seperti pada gambar referensi 2 tangan memakai baju rajut warna cream.`,
    `Susun alur 6 scene berurutan: ${angle.sceneFocus}.`,
    `Tambahkan doodle text font super cute yang sesuai dengan produk "${product.name}" (contoh aksen: ${angle.doodleIdeas}),`,
    `tetap pertahankan keaslian bentuk, warna, label, dan detail "${product.name}" ya.`,
  ]
    .join(' ')
    .slice(0, 1000);
}

function buildScriptPrompt(
  product: Product,
  angle: string,
  storyboardPrompt?: string
): string {
  const customGuidance = storyboardPrompt
    ? `Preferensi/arahan tambahan pengguna: ${storyboardPrompt}`
    : `Gunakan variasi kreatif yang unik sesuai karakteristik spesifik produk "${product.name}".`;

  return [
    'Buat paket prompt storyboard visual dan copywriting SEO + GEO Bahasa Indonesia untuk konten video pendek produk affiliate berikut.',
    `Nama produk: ${product.name}`,
    `Niche: ${product.niche}`,
    `Harga: Rp${product.priceIdr}`,
    `Trigger Keyword CTA: ${product.triggerKeyword}`,
    `Nomor Biolink: #${product.biolinkNumber}`,
    `Angle konten: ${angle}`,
    customGuidance,
    '',
    'Instruksi WAJIB tiap field JSON:',
    `1. "storyboardPrompt": Prompt siap pakai untuk Gemini Web yang menghasilkan 6 scene storyboard spesifik produk "${product.name}". WAJIB mempertahankan gaya inti: "buatkan storyboardnya 6 scene, buat seolah DIATAS meja seperti pada gambar referensi 2 tangan memakai baju rajut warna cream, tambahkan doodle text font super cute yang sesuai dengan produk ${product.name}, tetap pertahankan keaslian produk ya", lalu rincikan variasi aksi 2 tangan di 6 scene tersebut serta ide doodle text cute sesuai fungsi & kategori "${product.name}". Maksimal 950 karakter.`,
    `2. "captionSeo": Optimasi ganda SEO + GEO (Generative Engine Optimization). Tulis caption terstruktur yang kaya entitas dan bernilai informatif bagi pembaca maupun AI answer engine (Gemini/ChatGPT/TikTok Search): sebutkan nama lengkap "${product.name}" di kalimat awal, niche "${product.niche}", masalah yang diselesaikan, 2-3 manfaat utama nyata, kisaran harga Rp${product.priceIdr}, siapa yang paling cocok memakainya, dan CTA jelas ke komen "${product.triggerKeyword}" atau cek link #${product.biolinkNumber}.`,
    '3. "hashtags": 5-8 hashtag paling relevan yang memadukan kata kunci pencarian alami produk, kategori niche, dan problem/solusi.',
    `4. "pinnedComment": Komentar sematan singkat ramah yang WAJIB memuat trigger keyword "${product.triggerKeyword}" dan nomor biolink "#${product.biolinkNumber}".`,
    '5. "sceneCues": WAJIB tepat 6 scene ringkas (order 1..6) dengan "visualFocus", "doodleText" super cute (2-5 kata sesuai produk), dan "durationSec".',
    '6. "hook" & "scriptVoiceover": Ringkasan singkat pendukung internal (wajib tetap diisi singkat sesuai skema JSON).',
    '',
    'Kembalikan HANYA JSON valid sesuai skema:',
    '{ "hook": string, "scriptVoiceover": string, "captionSeo": string, "hashtags": string[], "pinnedComment": string, "storyboardPrompt": string, "sceneCues": [{ "order": number, "visualFocus": string, "doodleText": string, "durationSec": number }] }',
  ].join('\n');
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function clampString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['#fyp'];
  const cleaned = raw
    .map((item) => {
      if (typeof item !== 'string') return '';
      const stripped = item.trim().replace(/^#+/, '').replace(/[^a-zA-Z0-9_]/g, '');
      return stripped ? `#${stripped}` : '';
    })
    .filter((tag) => /^#[a-zA-Z0-9_]+$/.test(tag));
  const unique = [...new Set(cleaned)].slice(0, 15);
  return unique.length > 0 ? unique : ['#fyp'];
}

function parseScriptGeneratorOutput(parsedJson: unknown): ScriptGeneratorOutput {
  const obj =
    parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
      ? (parsedJson as Record<string, unknown>)
      : null;

  if (!obj) {
    throw new AppError(502, 'LLM returned non-object JSON payload for storyboard script');
  }

  const normalizedSceneCues = Array.isArray(obj.sceneCues)
    ? obj.sceneCues.slice(0, 10).map((cue, idx) => {
        const c = cue && typeof cue === 'object' ? (cue as Record<string, unknown>) : {};
        const rawOrder = Number(c.order);
        const order = Number.isInteger(rawOrder) && rawOrder > 0 ? rawOrder : idx + 1;
        const visualFocus = clampString(c.visualFocus, 500) ?? `Scene ${idx + 1}`;
        const doodleText = clampString(c.doodleText, 80);
        const rawDur = Number(c.durationSec);
        const durationSec =
          Number.isFinite(rawDur) && rawDur > 0 ? Math.min(rawDur, 15) : 3;
        return {
          order,
          visualFocus: visualFocus.length >= 2 ? visualFocus : `${visualFocus}.`,
          ...(doodleText ? { doodleText } : {}),
          durationSec,
        };
      })
    : [];

  const normalized = {
    ...obj,
    hook: clampString(obj.hook, 160) ?? obj.hook,
    scriptVoiceover: clampString(obj.scriptVoiceover, 1200) ?? obj.scriptVoiceover,
    captionSeo: clampString(obj.captionSeo, 2200) ?? obj.captionSeo,
    hashtags: normalizeHashtags(obj.hashtags),
    pinnedComment: clampString(obj.pinnedComment, 500) ?? obj.pinnedComment,
    ...(obj.storyboardPrompt !== undefined
      ? { storyboardPrompt: clampString(obj.storyboardPrompt, 1000) }
      : {}),
    sceneCues: normalizedSceneCues,
  };

  const result = ScriptGeneratorOutputSchema.safeParse(normalized);
  if (!result.success) {
    const issueMsg = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new AppError(502, `LLM script output invalid: ${issueMsg}`);
  }
  return result.data;
}

const KEYWORD_STOPWORDS = new Set([
  'SALE',
  'PAKET',
  'NEW',
  'PROMO',
  'MURAH',
  'ORIGINAL',
  'ORI',
  'OFFICIAL',
  'STORE',
  'SHOP',
  'INDONESIA',
  'REBORN',
  'REBORNOFFICIAL',
  'COMPLETE',
  'PACKAGE',
  'DAN',
  'UNTUK',
  'DENGAN',
  'YANG',
  'DARI',
  'ISI',
  'PCS',
  'SET',
  'FREE',
  'GIFT',
  'COD',
  'BPOM',
  'HALAL',
  'TERLARIS',
  'VIRAL',
  'PRODUK',
]);

export function buildSeoGeoTriggerKeyword(
  product: Product,
  biolinkNumber: string,
  usedKeywords: ReadonlySet<string>
): string {
  const sources = [
    product.name,
    product.kalodataSnapshot?.terCategory?.categoryName,
    product.kalodataSnapshot?.secCategory?.categoryName,
    product.niche,
    product.kalodataSnapshot?.sellerName,
  ];
  const uniqueTokens: string[] = [];
  const seenTokens = new Set<string>();

  for (const src of sources) {
    if (!src) continue;
    for (const part of src.split(/[^A-Za-z0-9]+/)) {
      const upper = part.toUpperCase();
      if (
        upper.length < 3 ||
        KEYWORD_STOPWORDS.has(upper) ||
        /^\d+$/.test(upper) ||
        seenTokens.has(upper)
      ) {
        continue;
      }
      seenTokens.add(upper);
      uniqueTokens.push(upper);
    }
  }

  let stem = 'PRODUK';
  if (uniqueTokens.length >= 2) {
    stem = `${uniqueTokens[0]!.slice(0, 5)}${uniqueTokens[1]!.slice(0, 5)}`;
  } else if (uniqueTokens.length === 1) {
    stem = uniqueTokens[0]!.slice(0, 8);
  }
  if (stem.length < 3) {
    stem = `${stem}BUY`.slice(0, 6);
  }

  const baseCandidate = stem.slice(0, 12);
  if (
    /^[A-Z0-9]{4,16}$/.test(baseCandidate) &&
    !/^(KD\d+|CANDIDATE)/.test(baseCandidate) &&
    !usedKeywords.has(baseCandidate)
  ) {
    return baseCandidate;
  }

  const numSuffix = biolinkNumber.replace(/\D/g, '').replace(/^0+/, '') || '1';
  let candidate = `${stem.slice(0, 16 - numSuffix.length)}${numSuffix}`;
  let counter = Number.parseInt(numSuffix, 10) || 1;
  while (usedKeywords.has(candidate) || !/^[A-Z0-9]{3,16}$/.test(candidate)) {
    counter += 1;
    const seq = String(counter);
    candidate = `${stem.slice(0, 16 - seq.length)}${seq}`;
  }
  return candidate;
}

function buildTriggerKeywordPrompt(
  product: Product,
  biolinkNumber: string,
  usedKeywords: string[]
): string {
  const category = [
    product.kalodataSnapshot?.priCategory?.categoryName,
    product.kalodataSnapshot?.secCategory?.categoryName,
    product.kalodataSnapshot?.terCategory?.categoryName,
  ]
    .filter(Boolean)
    .join(' > ');

  return [
    'Buat 1 Trigger Keyword DM otomatis yang optimal untuk SEO + GEO (Generative Engine Optimization) TikTok/Instagram/YouTube Shorts.',
    `Nama produk: ${product.name}`,
    `Niche: ${product.niche}`,
    category ? `Kategori Kalodata: ${category}` : '',
    product.kalodataSnapshot?.sellerName
      ? `Brand/Toko: ${product.kalodataSnapshot.sellerName}`
      : '',
    `Nomor Biolink: #${biolinkNumber}`,
    usedKeywords.length > 0
      ? `Dilarang memakai keyword yang sudah digunakan: ${usedKeywords.slice(0, 40).join(', ')}`
      : '',
    '',
    'Aturan WAJIB keyword:',
    '- 4 sampai 10 karakter HURUF KAPITAL + ANGKA saja (A-Z, 0-9), tanpa spasi atau simbol.',
    '- Mewakili entitas/manfaat inti produk yang mudah diketik penonton di kolom komentar dan relevan dengan pencarian SEO + AI Answer Engine (GEO).',
    '- Jangan pakai kode acak seperti KD101 atau CANDIDATE.',
    '',
    'Balas HANYA JSON valid: { "triggerKeyword": "CONTOH1" }',
  ]
    .filter(Boolean)
    .join('\n');
}

function parseGeneratedKeywordOrFallback(
  rawText: string,
  product: Product,
  biolinkNumber: string,
  usedSet: ReadonlySet<string>
): string {
  try {
    const parsed = JSON.parse(extractJsonText(rawText)) as {
      triggerKeyword?: unknown;
    };
    if (typeof parsed.triggerKeyword === 'string') {
      const cleaned = parsed.triggerKeyword
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 16);
      if (
        /^[A-Z0-9]{3,16}$/.test(cleaned) &&
        !/^(KD\d+|CANDIDATE)/.test(cleaned) &&
        !usedSet.has(cleaned)
      ) {
        return cleaned;
      }
    }
  } catch {
    // Fall back to deterministic SEO + GEO entity extraction
  }
  return buildSeoGeoTriggerKeyword(product, biolinkNumber, usedSet);
}

export function buildDefaultThreadsCopy(
  product: Product,
  affiliateUrl: string
): ThreadsCopyOutput {
  const priceText = `Rp${product.priceIdr.toLocaleString('id-ID')}`;
  const rootText = [
    `Lagi cari ${product.niche} yang beneran kepake harian?`,
    `${product.name} ini harganya cuma ${priceText} (rating ${product.rating.toFixed(1)}★) dan kualitasnya rapi banget ✨`,
    `Aku taruh link resminya di balasan bawah biar gampang cek ya 👇`,
  ]
    .join('\n\n')
    .slice(0, 480);

  const replyText = [
    `Link resmi ${product.name} (${priceText}) ada di sini ya kak 👇`,
    affiliateUrl,
    `Kode produk: ${product.triggerKeyword.toUpperCase()} (#${product.biolinkNumber})`,
  ]
    .join('\n')
    .slice(0, 480);

  return { rootText, replyText };
}

function buildThreadsCopyPrompt(product: Product, affiliateUrl: string): string {
  const priceText = `Rp${product.priceIdr.toLocaleString('id-ID')}`;
  return [
    'Buat 1 pasang copywriting Meta Threads Bahasa Indonesia untuk Chained Thread Affiliate (utas utama + balasan komentar pertama).',
    `Nama produk: ${product.name}`,
    `Niche: ${product.niche}`,
    `Harga: ${priceText}`,
    `Rating: ${product.rating.toFixed(1)}`,
    `Trigger Keyword / Kode: ${product.triggerKeyword}`,
    `Link Affiliate (untuk balasan): ${affiliateUrl}`,
    '',
    'Aturan WAJIB:',
    '1. "rootText": Hook santai, relatable, natural seperti pengguna Threads Indonesia (maks 420 karakter). DILARANG memasukkan URL/link di rootText agar jangkauan tidak turun.',
    `2. "replyText": Kalimat ajakan singkat yang ramah dan WAJIB menyertakan URL persis "${affiliateUrl}" (maks 420 karakter).`,
    '',
    'Balas HANYA JSON valid: { "rootText": "...", "replyText": "..." }',
  ].join('\n');
}

function parseThreadsCopyOrFallback(
  rawText: string,
  product: Product,
  affiliateUrl: string
): ThreadsCopyOutput {
  try {
    const parsed = JSON.parse(extractJsonText(rawText)) as {
      rootText?: unknown;
      replyText?: unknown;
    };
    const rootText = typeof parsed.rootText === 'string' ? parsed.rootText.trim() : '';
    let replyText = typeof parsed.replyText === 'string' ? parsed.replyText.trim() : '';
    if (rootText.length >= 10 && replyText.length >= 10) {
      if (!replyText.includes(affiliateUrl)) {
        replyText = `${replyText}\n${affiliateUrl}`.trim();
      }
      return {
        rootText: rootText.slice(0, 480),
        replyText: replyText.slice(0, 480),
      };
    }
  } catch {
    // Fall back to deterministic Threads copy
  }
  return buildDefaultThreadsCopy(product, affiliateUrl);
}

function enforceCtaInScript(
  output: ScriptGeneratorOutput,
  product: Product
): ScriptGeneratorOutput {
  const kw = product.triggerKeyword.toUpperCase();
  const bioRef = `#${product.biolinkNumber}`;

  let scriptVoiceover = output.scriptVoiceover;
  if (!scriptVoiceover.toUpperCase().includes(kw)) {
    scriptVoiceover = `${scriptVoiceover.trim()} Komen ${kw} sekarang ya!`;
  }

  let pinnedComment = output.pinnedComment;
  const hasKw = pinnedComment.toUpperCase().includes(kw);
  const hasBio = pinnedComment.includes(bioRef);
  if (!hasKw || !hasBio) {
    pinnedComment = `${pinnedComment.trim()} Komen ${kw} atau cek nomor ${bioRef} di bio!`;
  }

  const storyboardPrompt = (
    output.storyboardPrompt?.trim() || buildDefaultStoryboardPrompt(product)
  ).slice(0, 1000);

  return {
    ...output,
    storyboardPrompt,
    scriptVoiceover: scriptVoiceover.slice(0, 1200),
    pinnedComment: pinnedComment.slice(0, 500),
  };
}

export class GeminiLlmProvider implements ILlmProvider {
  readonly providerName: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LlmProviderOptions) {
    if (!options.apiKey) {
      throw new Error('GEMINI_API_KEY is required for GeminiLlmProvider');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-4-hydrogen';
    this.providerName = `gemini:${this.model}`;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generateScript(input: {
    product: Product;
    angle: string;
    storyboardPrompt?: string;
  }): Promise<ScriptGeneratorOutput> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildScriptPrompt(
                  input.product,
                  input.angle,
                  input.storyboardPrompt
                ),
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new AppError(
        response.status === 429 ? 429 : 502,
        `Gemini API error (${response.status} ${response.statusText}): ${bodyText.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    return parseScriptGeneratorOutput(parsedJson);
  }

  async generateTriggerKeyword(input: {
    product: Product;
    biolinkNumber: string;
    usedKeywords: string[];
  }): Promise<string> {
    const usedSet = new Set(input.usedKeywords.map((kw) => kw.toUpperCase()));
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildTriggerKeywordPrompt(
                    input.product,
                    input.biolinkNumber,
                    input.usedKeywords
                  ),
                },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      if (!response.ok) {
        return buildSeoGeoTriggerKeyword(input.product, input.biolinkNumber, usedSet);
      }
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return parseGeneratedKeywordOrFallback(
        rawText,
        input.product,
        input.biolinkNumber,
        usedSet
      );
    } catch {
      return buildSeoGeoTriggerKeyword(input.product, input.biolinkNumber, usedSet);
    }
  }

  async generateThreadsCopy(input: {
    product: Product;
    affiliateUrl: string;
  }): Promise<ThreadsCopyOutput> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: buildThreadsCopyPrompt(input.product, input.affiliateUrl) },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      if (!response.ok) {
        return buildDefaultThreadsCopy(input.product, input.affiliateUrl);
      }
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return parseThreadsCopyOrFallback(rawText, input.product, input.affiliateUrl);
    } catch {
      return buildDefaultThreadsCopy(input.product, input.affiliateUrl);
    }
  }
}

export class OpenAiLlmProvider implements ILlmProvider {
  readonly providerName: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LlmProviderOptions) {
    if (!options.apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAiLlmProvider');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gpt-4o-mini';
    this.providerName = `openai:${this.model}`;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generateScript(input: {
    product: Product;
    angle: string;
    storyboardPrompt?: string;
  }): Promise<ScriptGeneratorOutput> {
    const response = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Anda adalah copywriter affiliate video pendek Indonesia. Balas hanya JSON.',
          },
          {
            role: 'user',
            content: buildScriptPrompt(
              input.product,
              input.angle,
              input.storyboardPrompt
            ),
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new AppError(
        response.status === 429 ? 429 : 502,
        `OpenAI API error (${response.status} ${response.statusText}): ${bodyText.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = data.choices?.[0]?.message?.content ?? '';
    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    return parseScriptGeneratorOutput(parsedJson);
  }

  async generateTriggerKeyword(input: {
    product: Product;
    biolinkNumber: string;
    usedKeywords: string[];
  }): Promise<string> {
    const usedSet = new Set(input.usedKeywords.map((kw) => kw.toUpperCase()));
    try {
      const response = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Anda adalah spesialis SEO + GEO affiliate Indonesia. Balas hanya JSON.',
            },
            {
              role: 'user',
              content: buildTriggerKeywordPrompt(
                input.product,
                input.biolinkNumber,
                input.usedKeywords
              ),
            },
          ],
        }),
      });
      if (!response.ok) {
        return buildSeoGeoTriggerKeyword(input.product, input.biolinkNumber, usedSet);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = data.choices?.[0]?.message?.content ?? '';
      return parseGeneratedKeywordOrFallback(
        rawText,
        input.product,
        input.biolinkNumber,
        usedSet
      );
    } catch {
      return buildSeoGeoTriggerKeyword(input.product, input.biolinkNumber, usedSet);
    }
  }

  async generateThreadsCopy(input: {
    product: Product;
    affiliateUrl: string;
  }): Promise<ThreadsCopyOutput> {
    try {
      const response = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Anda adalah kreator Threads affiliate Indonesia. Balas hanya JSON.',
            },
            {
              role: 'user',
              content: buildThreadsCopyPrompt(input.product, input.affiliateUrl),
            },
          ],
        }),
      });
      if (!response.ok) {
        return buildDefaultThreadsCopy(input.product, input.affiliateUrl);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = data.choices?.[0]?.message?.content ?? '';
      return parseThreadsCopyOrFallback(rawText, input.product, input.affiliateUrl);
    } catch {
      return buildDefaultThreadsCopy(input.product, input.affiliateUrl);
    }
  }
}

export class ScriptGeneratorService {
  private readonly maxRetries: number;

  constructor(
    private readonly provider: ILlmProvider,
    options?: { maxRetries?: number }
  ) {
    this.maxRetries = options?.maxRetries ?? 2;
  }

  async generateForProduct(
    product: Product,
    angle: string,
    storyboardPrompt?: string
  ): Promise<ScriptGeneratorOutput> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const raw = await this.provider.generateScript({
          product,
          angle,
          storyboardPrompt,
        });
        const validated = ScriptGeneratorOutputSchema.parse(raw);
        return enforceCtaInScript(validated, product);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to generate valid script JSON');
  }
}
