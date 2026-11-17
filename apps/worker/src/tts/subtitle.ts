export interface WordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export function formatSrtTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
}

export function formatAssTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const centis = Math.floor((safeMs % 1000) / 10);
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}.${pad2(centis)}`;
}

export function groupWordBoundaries(
  words: WordBoundary[],
  maxWordsPerCue = 4
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < words.length; i += maxWordsPerCue) {
    const slice = words.slice(i, i + maxWordsPerCue);
    const first = slice[0]!;
    const last = slice.at(-1)!;
    cues.push({
      index: cues.length + 1,
      startMs: first.offsetMs,
      endMs: last.offsetMs + last.durationMs,
      text: slice.map((w) => w.text.trim()).join(' '),
    });
  }
  return cues;
}

export function buildSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}`
    )
    .join('\n\n')
    .concat('\n');
}

/**
 * Generates an ASS subtitle file positioned in the TikTok/Reels/Shopee safe zone:
 * Alignment=2 (bottom-center), MarginV=520 (~27% from bottom on 1920px height),
 * MarginR=140 to clear right-side action buttons.
 */
export function buildAss(cues: SubtitleCue[]): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,140,520,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = cues.map(
    (cue) =>
      `Dialogue: 0,${formatAssTime(cue.startMs)},${formatAssTime(cue.endMs)},Default,,0,0,0,,${cue.text}`
  );

  return [...header, ...events, ''].join('\n');
}
