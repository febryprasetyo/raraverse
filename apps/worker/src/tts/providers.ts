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

function createSilentWavBuffer(durationSec: number, sampleRate = 16000): Buffer {
  const numSamples = Math.max(1, Math.round(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

export class MockTtsProvider implements ITtsProvider {
  async synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
    const wordBoundaries = estimateWordBoundaries(input.text);
    const last = wordBoundaries.at(-1);
    const durationSec = last ? Number(((last.offsetMs + last.durationMs) / 1000).toFixed(2)) : 1;
    await writeFile(input.outputAudioPath, createSilentWavBuffer(durationSec));
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
    const pythonBin = process.env.PYTHON_BIN || 'python';
    await execFileAsync(pythonBin, [
      '-m',
      'edge_tts',
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
