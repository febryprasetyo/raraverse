export interface FfmpegStitchInput {
  clipPaths: string[];
  voiceoverPath: string;
  subtitleAssPath: string;
  bgmPath?: string;
  outputPath: string;
  targetDurationSec: number;
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Builds deterministic FFmpeg CLI arguments for 1080x1920 30fps vertical video stitching,
 * ASS safe-zone subtitle burn-in, optional BGM sidechain ducking, and metadata stripping.
 */
export function buildFfmpegStitchArgs(input: FfmpegStitchInput): string[] {
  if (input.clipPaths.length === 0) {
    throw new Error('At least one raw video clip is required for FFmpeg stitching');
  }

  const args: string[] = ['-y'];
  for (const clip of input.clipPaths) {
    args.push('-stream_loop', '-1', '-i', clip);
  }
  const voiceIdx = input.clipPaths.length;
  args.push('-i', input.voiceoverPath);

  const hasBgm = Boolean(input.bgmPath);
  const bgmIdx = voiceIdx + 1;
  if (input.bgmPath) {
    args.push('-stream_loop', '-1', '-i', input.bgmPath);
  }

  const clipCount = input.clipPaths.length;
  const perClipSec = Math.max(2, Number((input.targetDurationSec / clipCount).toFixed(2)));
  const filterParts: string[] = [];

  const normalizedLabels: string[] = [];
  for (let i = 0; i < clipCount; i += 1) {
    const label = `v${i}`;
    filterParts.push(
      `[${i}:v]trim=duration=${perClipSec},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[${label}]`
    );
    normalizedLabels.push(`[${label}]`);
  }

  const escapedAss = escapeFilterPath(input.subtitleAssPath);
  filterParts.push(
    `${normalizedLabels.join('')}concat=n=${clipCount}:v=1:a=0[vcat];[vcat]ass='${escapedAss}'[vout]`
  );

  if (hasBgm) {
    filterParts.push(
      `[${bgmIdx}:a]volume=0.18[bgm_low];[bgm_low][${voiceIdx}:a]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=250[bgm_ducked];[${voiceIdx}:a][bgm_ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    );
  } else {
    filterParts.push(`[${voiceIdx}:a]anull[aout]`);
  }

  args.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    input.outputPath
  );

  return args;
}
