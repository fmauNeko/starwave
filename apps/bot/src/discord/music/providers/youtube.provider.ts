import { Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import { ClientType, Innertube, UniversalCache } from 'youtubei.js';
import type { Track } from '../music-queue';
import { MusicProvider } from './music-provider.decorator';
import type { MusicProvider as MusicProviderInterface } from './music-provider.interface';

const YOUTUBE_URL_PATTERN = regex(
  '(?:youtube\\.com/watch\\?v=|youtu\\.be/|youtube\\.com/embed/)([a-zA-Z0-9_-]{11})',
);
const VIDEO_ID_PATTERN = regex('^([a-zA-Z0-9_-]{11})$');

@MusicProvider()
export class YouTubeProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'YouTube';
  private readonly logger = new Logger(YouTubeProvider.name);
  private innertube!: Innertube;

  public async onModuleInit(): Promise<void> {
    this.innertube = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      client_type: ClientType.ANDROID,
    });
    this.logger.log('YouTube.js client initialized');
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

    const info = await this.innertube.getBasicInfo(videoId);
    const { basic_info } = info;

    return {
      url,
      title: basic_info.title ?? 'Unknown Title',
      duration: basic_info.duration ?? 0,
      thumbnail: basic_info.thumbnail?.[0]?.url ?? '',
      requestedBy,
    };
  }

  public async getAudioUrl(url: string): Promise<string> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    const info = await this.innertube.getBasicInfo(videoId);
    const streamingData = info.streaming_data;

    if (!streamingData) {
      throw new Error('No streaming data available for this video');
    }

    const audioFormat = streamingData.adaptive_formats.find(
      (format) =>
        format.has_audio &&
        !format.has_video &&
        format.mime_type.includes('audio/webm') &&
        format.mime_type.includes('opus'),
    );

    const fallbackFormat = streamingData.adaptive_formats.find(
      (format) => format.has_audio && !format.has_video,
    );

    const selectedFormat = audioFormat ?? fallbackFormat;

    if (!selectedFormat?.url) {
      throw new Error('No audio format available for this video');
    }

    return selectedFormat.url;
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
