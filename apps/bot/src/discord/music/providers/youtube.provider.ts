import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import type { Track } from '../music-queue';
import { YouTubeStreamService } from '../youtube/youtube-stream.service';
import { MusicProvider } from './music-provider.decorator';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

const YOUTUBE_URL_PATTERN = regex(
  '(?:youtube\\.com/watch\\?v=|youtu\\.be/|youtube\\.com/embed/)([a-zA-Z0-9_-]{11})',
);
const VIDEO_ID_PATTERN = regex('^([a-zA-Z0-9_-]{11})$');

@MusicProvider()
@Injectable()
export class YouTubeProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'YouTube';
  private readonly logger = new Logger(YouTubeProvider.name);

  public constructor(private readonly streamService: YouTubeStreamService) {}

  public onModuleInit(): void {
    this.logger.log('YouTube provider initialized with youtubei.js backend');
  }

  public canHandle(url: string): boolean {
    return this.extractVideoId(url) !== null;
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    const metadata = await this.streamService.getMetadata(videoId);

    return {
      url: metadata.url,
      title: metadata.title,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      requestedBy,
    };
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    return this.streamService.getAudioStream(videoId);
  }

  public async search(query: string, requestedBy: string): Promise<Track> {
    const metadata = await this.streamService.search(query);

    return {
      url: metadata.url,
      title: metadata.title,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      requestedBy,
    };
  }

  private extractVideoId(url: string): string | null {
    const urlMatch = YOUTUBE_URL_PATTERN.exec(url);
    if (urlMatch?.[1]) {
      return urlMatch[1];
    }

    const idMatch = VIDEO_ID_PATTERN.exec(url);
    if (idMatch?.[1]) {
      return idMatch[1];
    }

    return null;
  }
}
