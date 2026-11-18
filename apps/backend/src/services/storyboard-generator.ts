import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Product, ScriptGeneratorOutput } from '@ebieshop/shared';

const execFileAsync = promisify(execFile);

const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-exp-image-generation',
];

// Minimal 1x1 JPEG used only when running offline without source images or FFmpeg
const MINIMAL_JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

interface LoadedImage {
  data: Buffer;
  mimeType: string;
}

export interface StoryboardGridInput {
  assetId: string;
  product: Product;
  script: ScriptGeneratorOutput;
  storyboardPrompt: string;
  productImageUrl?: string;
  backgroundImageUrl?: string;
  localStorageRoot: string;
  geminiApiKey?: string;
  fetchFn?: typeof fetch;
}

export interface StoryboardGridResult {
  filePath: string;
  publicPath: string;
}

function guessMimeType(pathOrUrl: string, headerType?: string | null): string {
  const cleanHeader = headerType?.split(';')[0]?.trim().toLowerCase();
  if (cleanHeader && cleanHeader.startsWith('image/')) {
    return cleanHeader;
  }
  const lower = pathOrUrl.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function loadImageBytes(
  source: string | undefined,
  localStorageRoot: string,
  fetchFn: typeof fetch
): Promise<LoadedImage | null> {
  if (!source) {
    return null;
  }
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  const localPrefix = '/api/v1/assets/local-file/';
  if (trimmed.startsWith(localPrefix)) {
    const relativePath = trimmed.slice(localPrefix.length).replace(/^\/+/, '');
    const resolvedRoot = resolve(localStorageRoot);
    const targetPath = resolve(resolvedRoot, relativePath);
    if (!targetPath.startsWith(resolvedRoot)) {
      return null;
    }
    try {
      const data = await readFile(targetPath);
      return data.byteLength > 0 ? { data, mimeType: guessMimeType(targetPath) } : null;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetchFn(trimmed, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        return null;
      }
      const mimeType = guessMimeType(trimmed, res.headers?.get?.('content-type'));
      const data = Buffer.from(await res.arrayBuffer());
      return data.byteLength > 0 ? { data, mimeType } : null;
    } catch {
      return null;
    }
  }

  return null;
}

function buildMultimodalGridPrompt(
  product: Product,
  script: ScriptGeneratorOutput,
  storyboardPrompt: string
): string {
  const sceneLines = script.sceneCues
    .slice(0, 6)
    .map(
      (cue) =>
        `Panel ${cue.order}: ${cue.visualFocus}${cue.doodleText ? ` | Doodle text: "${cue.doodleText}"` : ''}`
    )
    .join('\n');

  return [
    'Create a SINGLE 2-column by 3-row (6-panel) vertical storyboard grid image (aspect ratio 9:16 overall, clean thin panel borders).',
    `Product: ${product.name}.`,
    `Style & direction: ${storyboardPrompt}`,
    'Use the provided product photo and strictly preserve the authentic look, shape, label, and color of the product.',
    'If a background/tabletop reference image is provided, place the scenes on that tabletop style with two hands wearing a cream knit sweater.',
    'Add cute hand-drawn doodle text stickers per panel matching these 6 scenes:',
    sceneLines,
  ].join('\n');
}

async function generateViaGeminiMultimodal(
  geminiApiKey: string,
  prompt: string,
  productImage: LoadedImage | null,
  backgroundImage: LoadedImage | null,
  fetchFn: typeof fetch
): Promise<Buffer | null> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (productImage) {
    parts.push({
      inlineData: {
        mimeType: productImage.mimeType,
        data: productImage.data.toString('base64'),
      },
    });
  }
  if (backgroundImage) {
    parts.push({
      inlineData: {
        mimeType: backgroundImage.mimeType,
        data: backgroundImage.data.toString('base64'),
      },
    });
  }

  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType?: string; data?: string };
            }>;
          };
        }>;
      };
      const imagePart = payload.candidates?.[0]?.content?.parts?.find(
        (p) => Boolean(p.inlineData?.data)
      );
      const base64Data = imagePart?.inlineData?.data;
      if (base64Data) {
        const buf = Buffer.from(base64Data, 'base64');
        if (buf.byteLength > 256) {
          return buf;
        }
      }
    } catch {
      // Try next model or fallback composite
    }
  }

  return null;
}

async function composeFallbackGrid(
  outputFilePath: string,
  tempDir: string,
  productImage: LoadedImage | null,
  backgroundImage: LoadedImage | null
): Promise<void> {
  const bgTemp = join(tempDir, 'tmp-bg.img');
  const prodTemp = join(tempDir, 'tmp-prod.img');

  try {
    if (backgroundImage && productImage) {
      await Promise.all([
        writeFile(bgTemp, backgroundImage.data),
        writeFile(prodTemp, productImage.data),
      ]);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        bgTemp,
        '-i',
        prodTemp,
        '-filter_complex',
        '[0:v]scale=540:640:force_original_aspect_ratio=increase,crop=540:640[bg];[1:v]scale=340:340:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,loop=loop=5:size=1:start=0,tile=2x3[grid]',
        '-map',
        '[grid]',
        '-frames:v',
        '1',
        outputFilePath,
      ]);
      return;
    }

    const single = productImage ?? backgroundImage;
    if (single) {
      await writeFile(prodTemp, single.data);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        prodTemp,
        '-filter_complex',
        '[0:v]scale=540:640:force_original_aspect_ratio=increase,crop=540:640,loop=loop=5:size=1:start=0,tile=2x3[grid]',
        '-map',
        '[grid]',
        '-frames:v',
        '1',
        outputFilePath,
      ]);
      return;
    }
  } catch {
    // Fall back to direct file write if FFmpeg or test image bytes fail
  } finally {
    await rm(bgTemp, { force: true }).catch(() => {});
    await rm(prodTemp, { force: true }).catch(() => {});
  }

  const fallbackBuffer = productImage?.data ?? backgroundImage?.data ?? MINIMAL_JPEG_BUFFER;
  await writeFile(outputFilePath, fallbackBuffer);
}

/**
 * Generates a single 2x3 (6-panel) storyboard grid image combining product authenticity
 * and tabletop/hand background references via Gemini Multimodal, with FFmpeg grid fallback.
 */
export class StoryboardImageGenerator {
  async generateSixPanelGrid(input: StoryboardGridInput): Promise<StoryboardGridResult> {
    const fetchFn = input.fetchFn ?? fetch;
    const targetDir = join(input.localStorageRoot, 'storyboards', input.assetId);
    await mkdir(targetDir, { recursive: true });
    const publicPath = `storyboards/${input.assetId}/storyboard-grid.jpg`;
    const filePath = join(targetDir, 'storyboard-grid.jpg');

    const [productImage, backgroundImage] = await Promise.all([
      loadImageBytes(input.productImageUrl, input.localStorageRoot, fetchFn),
      loadImageBytes(input.backgroundImageUrl, input.localStorageRoot, fetchFn),
    ]);

    if (input.geminiApiKey) {
      const prompt = buildMultimodalGridPrompt(
        input.product,
        input.script,
        input.storyboardPrompt
      );
      const aiImage = await generateViaGeminiMultimodal(
        input.geminiApiKey,
        prompt,
        productImage,
        backgroundImage,
        fetchFn
      );
      if (aiImage) {
        await writeFile(filePath, aiImage);
        return { filePath, publicPath };
      }
    }

    await composeFallbackGrid(filePath, targetDir, productImage, backgroundImage);
    return { filePath, publicPath };
  }
}
