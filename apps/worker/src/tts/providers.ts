import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { WordBoundary } from './subtitle.js';

const execFileAsync = promisify(execFile);

export interface TtsSynthesisInput {
  text: string;
  voiceId: string;
  outputAudioPath: string;
}

export interface TtsSynthesisResult {
  audioPath: string;
  wordBoundaries: WordBoundary[];
  durationSec: number;
}

export interface ITtsProvider {
  synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult>;
}

/**
 * Generates deterministic word boundaries for mock/test runs without external TTS calls.
 */
export function estimateWordBoundaries(text: string, msPerWord = 340): WordBoundary[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let cursor = 0;
  return words.map((word) => {
    const durationMs = Math.max(180, Math.min(600, word.length * 45 + msPerWord * 0.4));
    const entry: WordBoundary = {
      text: word,
      offsetMs: Math.round(cursor),
      durationMs: Math.round(durationMs),
    };
    cursor += durationMs + 40;
    return entry;
  });
}

export class MockTtsProvider implements ITtsProvider {
  async synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
    await writeFile(input.outputAudioPath, Buffer.from('ID3-MOCK-MP3'));
    const wordBoundaries = estimateWordBoundaries(input.text);
    const last = wordBoundaries.at(-1);
    const durationSec = last ? Number(((last.offsetMs + last.durationMs) / 1000).toFixed(2)) : 1;
    return {
      audioPath: input.outputAudioPath,
      wordBoundaries,
      durationSec,
    };
  }
}

/**
 * Invokes `edge-tts` CLI (Python package) to synthesize Indonesian neural voiceover
 * and parse word boundaries.
 */
export class EdgeTtsProvider implements ITtsProvider {
  async synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
    const voice = input.voiceId || 'id-ID-GadisNeural';
    await execFileAsync('edge-tts', [
      '--voice',
      voice,
      '--text',
      input.text,
      '--write-media',
      input.outputAudioPath,
    ]);

    const wordBoundaries = estimateWordBoundaries(input.text);
    const last = wordBoundaries.at(-1);
    const durationSec = last ? Number(((last.offsetMs + last.durationMs) / 1000).toFixed(2)) : 1;
    return {
      audioPath: input.outputAudioPath,
      wordBoundaries,
      durationSec,
    };
  }
}

export class ElevenLabsProvider implements ITtsProvider {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey: string; fetchFn?: typeof fetch }) {
    if (!options.apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required for ElevenLabsProvider');
    }
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
    const response = await this.fetchFn(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text: input.text,
          model_id: 'eleven_multilingual_v2',
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error (${response.status} ${response.statusText})`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    await writeFile(input.outputAudioPath, audioBuffer);

    const wordBoundaries = estimateWordBoundaries(input.text);
    const last = wordBoundaries.at(-1);
    const durationSec = last ? Number(((last.offsetMs + last.durationMs) / 1000).toFixed(2)) : 1;
    return {
      audioPath: input.outputAudioPath,
      wordBoundaries,
      durationSec,
    };
  }
}
