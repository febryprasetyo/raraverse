import { describe, expect, it } from 'vitest';
import { buildAss, buildSrt, groupWordBoundaries, type WordBoundary } from '../tts/subtitle.js';

const sampleWords: WordBoundary[] = [
  { text: 'Meja', offsetMs: 0, durationMs: 300 },
  { text: 'dapur', offsetMs: 320, durationMs: 350 },
  { text: 'sempit', offsetMs: 700, durationMs: 400 },
  { text: 'bikin', offsetMs: 1150, durationMs: 300 },
  { text: 'sumpek?', offsetMs: 1500, durationMs: 450 },
  { text: 'Cek', offsetMs: 2050, durationMs: 250 },
  { text: 'rak', offsetMs: 2350, durationMs: 250 },
  { text: 'lipat', offsetMs: 2650, durationMs: 350 },
  { text: 'ini!', offsetMs: 3050, durationMs: 400 },
];

describe('Subtitle SRT/ASS generator', () => {
  it('groups word boundaries into chunks of at most 4 words per cue', () => {
    const cues = groupWordBoundaries(sampleWords, 4);
    expect(cues).toHaveLength(3);
    expect(cues[0]?.text).toBe('Meja dapur sempit bikin');
    expect(cues[0]?.startMs).toBe(0);
    expect(cues[0]?.endMs).toBe(1450);
    expect(cues[2]?.text).toBe('ini!');
  });

  it('formats valid SRT timestamps and sequence numbers', () => {
    const cues = groupWordBoundaries(sampleWords, 4);
    const srt = buildSrt(cues);

    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,450\nMeja dapur sempit bikin');
    expect(srt).toContain('2\n00:00:01,500 --> 00:00:03,000\nsumpek? Cek rak lipat');
  });

  it('generates ASS with 1080x1920 resolution and TikTok/Reels safe zone MarginV=520 MarginR=140', () => {
    const cues = groupWordBoundaries(sampleWords, 4);
    const ass = buildAss(cues);

    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toMatch(/Style: Default,.*?,2,60,140,520,1/);
    expect(ass).toContain(',140,520,');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.45,Default,,0,0,0,,Meja dapur sempit bikin');
  });
});
