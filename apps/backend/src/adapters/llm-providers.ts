import {
  ScriptGeneratorOutputSchema,
  type Product,
  type ScriptGeneratorOutput,
} from '@ebieshop/shared';
import type { ILlmProvider } from './contracts.js';

export interface LlmProviderOptions {
  apiKey: string;
  model?: string;
  fetchFn?: typeof fetch;
}

function buildScriptPrompt(product: Product, angle: string): string {
  return [
    'Buat naskah video pendek (15-30 detik) Bahasa Indonesia untuk produk affiliate berikut.',
    `Nama produk: ${product.name}`,
    `Niche: ${product.niche}`,
    `Harga: Rp${product.priceIdr}`,
    `Angle konten: ${angle}`,
    `WAJIB sertakan trigger keyword "${product.triggerKeyword}" dan nomor biolink "#${product.biolinkNumber}" pada scriptVoiceover dan pinnedComment.`,
    'Kembalikan HANYA JSON valid sesuai skema:',
    '{ "hook": string, "scriptVoiceover": string, "captionSeo": string, "hashtags": string[], "pinnedComment": string, "sceneCues": [{ "order": number, "visualFocus": string, "durationSec": number }] }',
  ].join('\n');
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
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

  return {
    ...output,
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
    this.model = options.model ?? 'gemini-2.5-flash';
    this.providerName = `gemini:${this.model}`;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generateScript(input: {
    product: Product;
    angle: string;
  }): Promise<ScriptGeneratorOutput> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildScriptPrompt(input.product, input.angle) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status} ${response.statusText})`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    return ScriptGeneratorOutputSchema.parse(parsedJson);
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
            content: buildScriptPrompt(input.product, input.angle),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error (${response.status} ${response.statusText})`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = data.choices?.[0]?.message?.content ?? '';
    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    return ScriptGeneratorOutputSchema.parse(parsedJson);
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
    angle: string
  ): Promise<ScriptGeneratorOutput> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const raw = await this.provider.generateScript({ product, angle });
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
