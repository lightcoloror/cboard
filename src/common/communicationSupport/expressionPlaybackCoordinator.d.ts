import type { TileDTO } from './dto';
export interface PlaybackResult {
  ok: boolean; message: string;
  reason?: 'invalid' | 'unavailable' | 'provider' | 'playback' | 'timeout' | 'stopped' | 'network';
}
interface Options { rate?: number; }
interface SpeechPort { speak(text: string, options?: Options): Promise<PlaybackResult>; stop(): void; }
interface AudioPort { play(source: string, options?: Options): Promise<PlaybackResult>; stop(): void; }
export function playExpressionSentence(options: {sentence: string; output: TileDTO[]; speechPort: SpeechPort; audioPort: AudioPort; rate?: number}): Promise<PlaybackResult>;
export function stopExpressionPlayback(speechPort: SpeechPort, audioPort: AudioPort): void;
