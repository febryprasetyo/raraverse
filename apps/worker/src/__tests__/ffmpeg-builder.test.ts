import { describe, expect, it } from 'vitest';
import { buildFfmpegStitchArgs } from '../ffmpeg/ffmpeg-builder.js';

describe('FFmpeg 1080x1920 Stitcher Args Builder', () => {
  it('builds 1080x1920 30fps yuv420p libx264 args with ASS burn-in, BGM ducking, and metadata stripping', () => {
    const args = buildFfmpegStitchArgs({
      clipPaths: ['/raw/clip_01.mp4', '/raw/clip_02.mp4'],
      voiceoverPath: '/work/voice.mp3',
      subtitleAssPath: '/work/subtitles.ass',
      bgmPath: '/bgm/chill.mp3',
      outputPath: '/work/final.mp4',
      targetDurationSec: 18.5,
    });

    const joined = args.join(' ');
    expect(joined).toContain('1080');
    expect(joined).toContain('1920');
    expect(joined).toContain('fps=30');
    expect(joined).toContain('yuv420p');
    expect(joined).toContain('libx264');
    expect(joined).toContain('sidechaincompress');
    expect(joined).toContain('ass=');
    expect(joined).toContain('-map_metadata -1');
    expect(joined).toContain('-fflags +bitexact');
    expect(args.at(-1)).toBe('/work/final.mp4');
  });

  it('builds valid args even when bgmPath is omitted', () => {
    const args = buildFfmpegStitchArgs({
      clipPaths: ['/raw/clip_01.mp4'],
      voiceoverPath: '/work/voice.mp3',
      subtitleAssPath: '/work/subtitles.ass',
      outputPath: '/work/final.mp4',
      targetDurationSec: 12,
    });

    const joined = args.join(' ');
    expect(joined).not.toContain('sidechaincompress');
    expect(joined).toContain('-map_metadata -1');
    expect(args.at(-1)).toBe('/work/final.mp4');
  });
});
