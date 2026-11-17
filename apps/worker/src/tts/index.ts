// Edge-TTS & ElevenLabs audio + SRT/ASS subtitle generators will be implemented here in Phase 2.
export interface TtsSynthesisResult {
  audioPath: string;
  subtitlePath: string;
  durationSec: number;
}
