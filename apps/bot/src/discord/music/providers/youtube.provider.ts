import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
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

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public onModuleInit(): void {
    this.logger.log('YouTube provider initialized with yt-dlp backend');
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

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await this.ytDlpService.getVideoInfo(canonicalUrl);

    return {
      url: canonicalUrl,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      requestedBy,
    };
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    this.logger.debug(`Getting audio info for video: ${videoId}`);

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const audioInfo = await this.ytDlpService.getAudioInfo(canonicalUrl);

    this.logger.debug(
      `Got audio URL (codec: ${audioInfo.codec}, container: ${audioInfo.container})`,
    );

    return audioInfo;
  }

  public async search(query: string, requestedBy: string): Promise<Track> {
    this.logger.debug(`Searching YouTube for: ${query}`);

    const info = await this.ytDlpService.search(query);

    this.logger.debug(`Found: ${info.title} (${info.url})`);

    return {
      url: info.url,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
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
