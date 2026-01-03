import type { Track } from '../music-queue';

export interface AudioInfo {
  url: string;
  codec: string;
  container: string;
}

export interface MusicProvider {
  readonly name: string;

  canHandle(url: string): boolean;

  fetchTrackInfo(url: string, requestedBy: string): Promise<Track>;

  getAudioInfo(url: string): Promise<AudioInfo>;
}

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
