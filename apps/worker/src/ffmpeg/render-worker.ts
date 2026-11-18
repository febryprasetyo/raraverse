import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { LocalVideoRenderJob } from '@ebieshop/shared';
import type { ITtsProvider } from '../tts/providers.js';
import { buildAss, buildSrt, groupWordBoundaries } from '../tts/subtitle.js';
import { buildFfmpegStitchArgs } from './ffmpeg-builder.js';
import { scanRawMediaDir } from './raw-media-scanner.js';

const execFileAsync = promisify(execFile);
const SEEDED_MOCK_MEDIA_DIRS = new Set(['kd_rak_001', 'kd_lampu_002']);

interface ScenePreset {
  scale: string;
  yOffset: number;
  bgColor: string;
}

const FALLBACK_SCENE_PRESETS: ScenePreset[] = [
  { scale: '960:960', yOffset: -120, bgColor: '0x0f172a' },
  { scale: '1040:1040', yOffset: -40, bgColor: '0x1e293b' },
  { scale: '900:900', yOffset: -180, bgColor: '0x064e3b' },
];

async function downloadImageToFile(
  url: string,
  destPath: string,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<boolean> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return false;
    }
    const contentType = res.headers?.get?.('content-type') ?? 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) {
      return false;
    }
    await writeFile(destPath, buf);
    return true;
  } catch {
    return false;
  }
}

function resolveAssetUrl(urlOrPath: string, vpsApiUrl: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  const base = vpsApiUrl.replace(/\/$/, '');
  const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${base}${path}`;
}

async function synthesizeClipsFromStoryboardGrid(
  storyboardImageUrl: string,
  job: LocalVideoRenderJob,
  workDir: string,
  vpsApiUrl: string,
  fetchFn: typeof fetch,
  runFfmpeg: (args: string[]) => Promise<void>
): Promise<string[] | null> {
  const fullUrl = resolveAssetUrl(storyboardImageUrl, vpsApiUrl);
  const gridPath = join(workDir, 'storyboard-grid.jpg');
  const downloaded = await downloadImageToFile(fullUrl, gridPath, fetchFn, 15_000);
  if (!downloaded) {
    return null;
  }

  const panelCount = 6;
  const generatedClips: string[] = [];
  for (let i = 0; i < panelCount; i += 1) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const durationSec = Math.max(2, Math.min(8, job.scriptJson.sceneCues[i]?.durationSec ?? 4));
    const frames = Math.round(durationSec * 30);
    const outClipPath = join(workDir, `storyboard_panel_${i}.mp4`);
    const preset = FALLBACK_SCENE_PRESETS[i % FALLBACK_SCENE_PRESETS.length]!;

    const panelArgs = [
      '-y',
      '-i',
      gridPath,
      '-vf',
      `crop=iw/2:ih/3:${col}*(iw/2):${row}*(ih/3),scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.001,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      outClipPath,
    ];

    const lavfiFallback = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${preset.bgColor}:s=1080x1920:r=30:d=${durationSec}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      outClipPath,
    ];

    try {
      await runFfmpeg(panelArgs);
    } catch {
      await runFfmpeg(lavfiFallback);
    }

    generatedClips.push(outClipPath);
  }

  return generatedClips;
}

async function synthesizeAiFallbackClips(
  job: LocalVideoRenderJob,
  workDir: string,
  vpsApiUrl: string,
  fetchFn: typeof fetch,
  runFfmpeg: (args: string[]) => Promise<void>
): Promise<string[]> {
  let baseImagePath: string | undefined;
  if (job.productImageUrl) {
    const candidatePath = join(workDir, 'product-base.jpg');
    const resolvedProductUrl = resolveAssetUrl(job.productImageUrl, vpsApiUrl);
    const ok = await downloadImageToFile(resolvedProductUrl, candidatePath, fetchFn, 8000);
    if (ok) {
      baseImagePath = candidatePath;
    }
  }

  const aiSceneImages: Array<string | undefined> = [undefined, undefined, undefined];
  const cues = job.scriptJson.sceneCues;
  for (let i = 0; i < 2; i += 1) {
    const cueText = cues[i]?.visualFocus ?? job.scriptJson.hook;
    const prompt = `${job.productName ?? 'home kitchen product'}, ${cueText}, vertical lifestyle product photography, studio lighting`;
    const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=720&height=1280&nologo=true&seed=${i + 1}`;
    const aiPath = join(workDir, `ai-scene-${i}.jpg`);
    const ok = await downloadImageToFile(aiUrl, aiPath, fetchFn, 5000);
    if (ok) {
      aiSceneImages[i] = aiPath;
    }
  }

  const generatedClips: string[] = [];
  for (let i = 0; i < FALLBACK_SCENE_PRESETS.length; i += 1) {
    const preset = FALLBACK_SCENE_PRESETS[i]!;
    const outClipPath = join(workDir, `ai_clip_${i}.mp4`);
    const imagePath = aiSceneImages[i] ?? baseImagePath;

    const lavfiArgs = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${preset.bgColor}:s=1080x1920:r=30:d=4`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      outClipPath,
    ];

    if (imagePath) {
      const imageArgs = [
        '-y',
        '-loop',
        '1',
        '-t',
        '4',
        '-i',
        imagePath,
        '-filter_complex',
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5,eq=brightness=-0.18[bg];[0:v]scale=${preset.scale}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${preset.yOffset >= 0 ? `+${preset.yOffset}` : preset.yOffset},fps=30,format=yuv420p[v]`,
        '-map',
        '[v]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        outClipPath,
      ];
      try {
        await runFfmpeg(imageArgs);
      } catch {
        await runFfmpeg(lavfiArgs);
      }
    } else {
      await runFfmpeg(lavfiArgs);
    }

    generatedClips.push(outClipPath);
  }

  return generatedClips;
}

export interface RenderJobResult {
  contentAssetId: string;
  videoR2Key: string;
  audioR2Key: string;
  subtitleR2Key: string;
  videoSha256: string;
  durationSec: number;
}

export interface RenderWorkerDependencies {
  ttsProvider: ITtsProvider;
  vpsApiUrl: string;
  workerSecret: string;
  bgmPath?: string;
  fetchFn?: typeof fetch;
  runFfmpeg?: (args: string[]) => Promise<void>;
}

async function defaultRunFfmpeg(args: string[]): Promise<void> {
  await execFileAsync('ffmpeg', args);
}

async function requestPresignedPut(
  deps: RenderWorkerDependencies,
  assetId: string,
  fileName: string,
  contentType: string
): Promise<{ uploadUrl: string; r2Key: string }> {
  const fetchFn = deps.fetchFn ?? fetch;
  const res = await fetchFn(`${deps.vpsApiUrl.replace(/\/$/, '')}/api/v1/assets/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deps.workerSecret}`,
    },
    body: JSON.stringify({ assetId, fileName, contentType }),
  });
  if (!res.ok) {
    throw new Error(`Failed to request presigned URL (${res.status})`);
  }
  return (await res.json()) as { uploadUrl: string; r2Key: string };
}

async function uploadFileToPresignedUrl(
  uploadUrl: string,
  filePath: string,
  contentType: string,
  fetchFn: typeof fetch
): Promise<void> {
  const body = await readFile(filePath);
  const res = await fetchFn(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!res.ok) {
    throw new Error(`Failed to upload asset to R2 (${res.status})`);
  }
}

export async function processLocalVideoRender(
  job: LocalVideoRenderJob,
  deps: RenderWorkerDependencies
): Promise<RenderJobResult> {
  const workDir = join(tmpdir(), `ebieshop-render-${job.contentAssetId}`);
  await mkdir(workDir, { recursive: true });
  const fetchFn = deps.fetchFn ?? fetch;
  const runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg;

  try {
    const audioPath = join(workDir, 'voiceover.mp3');
    const srtPath = join(workDir, 'subtitles.srt');
    const assPath = join(workDir, 'subtitles.ass');
    const outputVideoPath = join(workDir, 'final.mp4');

    const ttsResult = await deps.ttsProvider.synthesize({
      text: job.scriptJson.scriptVoiceover,
      voiceId: job.ttsVoiceId,
      outputAudioPath: audioPath,
    });

    const cues = groupWordBoundaries(ttsResult.wordBoundaries, 4);
    await writeFile(srtPath, buildSrt(cues), 'utf-8');
    await writeFile(assPath, buildAss(cues), 'utf-8');

    let clips: string[] | null = null;
    if (job.storyboardImageUrl) {
      clips = await synthesizeClipsFromStoryboardGrid(
        job.storyboardImageUrl,
        job,
        workDir,
        deps.vpsApiUrl,
        fetchFn,
        runFfmpeg
      );
    }
    if (!clips) {
      try {
        clips = await scanRawMediaDir(job.rawMediaDir);
      } catch {
        clips = await synthesizeAiFallbackClips(
          job,
          workDir,
          deps.vpsApiUrl,
          fetchFn,
          runFfmpeg
        );
      }
    }
    const ffmpegArgs = buildFfmpegStitchArgs({
      clipPaths: clips,
      voiceoverPath: audioPath,
      subtitleAssPath: assPath,
      bgmPath: deps.bgmPath,
      outputPath: outputVideoPath,
      targetDurationSec: ttsResult.durationSec + 0.5,
    });

    await runFfmpeg(ffmpegArgs);

    const videoBuffer = await readFile(outputVideoPath);
    const videoSha256 = createHash('sha256').update(videoBuffer).digest('hex');

    const [audioPut, srtPut, videoPut] = await Promise.all([
      requestPresignedPut(deps, job.contentAssetId, 'voiceover.mp3', 'audio/mpeg'),
      requestPresignedPut(deps, job.contentAssetId, 'subtitles.srt', 'application/x-subrip'),
      requestPresignedPut(deps, job.contentAssetId, 'final.mp4', 'video/mp4'),
    ]);

    await Promise.all([
      uploadFileToPresignedUrl(audioPut.uploadUrl, audioPath, 'audio/mpeg', fetchFn),
      uploadFileToPresignedUrl(srtPut.uploadUrl, srtPath, 'application/x-subrip', fetchFn),
      uploadFileToPresignedUrl(videoPut.uploadUrl, outputVideoPath, 'video/mp4', fetchFn),
    ]);

    return {
      contentAssetId: job.contentAssetId,
      videoR2Key: videoPut.r2Key,
      audioR2Key: audioPut.r2Key,
      subtitleR2Key: srtPut.r2Key,
      videoSha256,
      durationSec: ttsResult.durationSec,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
    if (job.cleanupRawMediaAfterRender) {
      const normalizedDir = job.rawMediaDir.replace(/\\/g, '/').replace(/\/+$/, '');
      const baseName = normalizedDir.split('/').pop() ?? '';
      if (baseName && !SEEDED_MOCK_MEDIA_DIRS.has(baseName)) {
        await rm(job.rawMediaDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
