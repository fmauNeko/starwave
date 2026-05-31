import type { Readable } from 'node:stream';
import { StreamType } from '@discordjs/voice';
import type { Track } from '../music-queue';

export interface AudioInfo {
  source: Readable | string;
  streamType: StreamType;
}

export interface MusicProvider {
  readonly name: string;

  canHandle(url: string): boolean;

  fetchTrackInfo(url: string, requestedBy: string): Promise<Track>;

  getAudioInfo(url: string): Promise<AudioInfo>;

  search(query: string, requestedBy: string): Promise<Track>;
}

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
