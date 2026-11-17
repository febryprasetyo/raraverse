import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

export function shuffleClips(paths: string[]): string[] {
  const copy = [...paths];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export async function scanRawMediaDir(rawMediaDir: string): Promise<string[]> {
  const entries = await readdir(rawMediaDir, { withFileTypes: true });
  const clips = entries
    .filter(
      (entry) =>
        entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )
    .map((entry) => join(rawMediaDir, entry.name))
    .sort();

  if (clips.length === 0) {
    throw new Error(`No raw video clips found in '${rawMediaDir}'`);
  }

  return shuffleClips(clips);
}
