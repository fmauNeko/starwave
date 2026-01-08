import type { Track } from '../music-queue';
import type { ProviderType } from './provider-types';

export interface AudioInfo {
  url: string;
  codec: string;
  container: string;
  expiresAt?: Date;
}

export interface MusicProvider {
  readonly name: string;
  readonly type: ProviderType;
  readonly priority: number;

  canHandle(url: string): boolean;

  fetchTrackInfo(url: string, requestedBy: string): Promise<Track>;

  getAudioInfo(url: string): Promise<AudioInfo>;

  search(query: string, requestedBy: string, limit?: number): Promise<Track[]>;

  fetchPlaylist?(
    url: string,
    requestedBy: string,
    maxTracks?: number,
  ): Promise<Track[]>;

  refreshStreamUrl?(track: Track): Promise<string>;
}

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
