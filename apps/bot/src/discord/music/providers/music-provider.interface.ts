import type { Track } from '../music-queue';

export interface MusicProvider {
  readonly name: string;

  canHandle(url: string): boolean;

  fetchTrackInfo(url: string, requestedBy: string): Promise<Track>;

  getAudioUrl(url: string): Promise<string>;
}

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
