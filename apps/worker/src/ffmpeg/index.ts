// FFmpeg 1080x1920 multi-clip stitcher, safe-zone subtitle burn-in, and audio ducking (Phase 2).
export interface StitchOptions {
  rawMediaDir: string;
  audioPath: string;
  subtitlePath: string;
  outputPath: string;
}
