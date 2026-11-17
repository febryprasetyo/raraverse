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

    const clips = await scanRawMediaDir(job.rawMediaDir);
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
  }
}
