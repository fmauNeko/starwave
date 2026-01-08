import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

const YOUTUBE_URL_PATTERN = regex(
  '(?:youtube\\.com/watch\\?v=|youtu\\.be/|youtube\\.com/embed/)([a-zA-Z0-9_-]{11})',
);
const VIDEO_ID_PATTERN = regex('^([a-zA-Z0-9_-]{11})$');
const YOUTUBE_PLAYLIST_PATTERN = regex(
  '(?:youtube\\.com/playlist\\?list=|youtube\\.com/watch\\?.*list=)([a-zA-Z0-9_-]+)',
);

@MusicProvider()
@Injectable()
export class YouTubeProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'YouTube';
  public readonly type = ProviderType.YouTube;
  public readonly priority = 10;

  private readonly logger = new Logger(YouTubeProvider.name);

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public onModuleInit(): void {
    this.logger.log('YouTube provider initialized with yt-dlp backend');
  }

  public canHandle(url: string): boolean {
    return (
      this.extractVideoId(url) !== null || YOUTUBE_PLAYLIST_PATTERN.test(url)
    );
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
      provider: this.type,
      isLive: info.duration === 0,
      addedAt: new Date(),
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

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    this.logger.debug(`Searching YouTube for: ${query}`);

    const results: Track[] = [];

    for (let i = 0; i < limit; i++) {
      try {
        const info = await this.ytDlpService.search(query);

        this.logger.debug(`Found: ${info.title} (${info.url})`);

        results.push({
          url: info.url,
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail,
          requestedBy,
          provider: this.type,
          isLive: info.duration === 0,
          addedAt: new Date(),
        });
        break; // yt-dlp search returns single result, break after first
      } catch (error) {
        this.logger.warn(`Search iteration ${String(i + 1)} failed`, error);
      }
    }

    return results;
  }

  public async fetchPlaylist(
    url: string,
    requestedBy: string,
    maxTracks = 30,
  ): Promise<Track[]> {
    if (!YOUTUBE_PLAYLIST_PATTERN.test(url)) {
      throw new Error('Not a YouTube playlist URL');
    }

    return this.ytDlpService.getPlaylistTracks(
      url,
      requestedBy,
      maxTracks,
      this.type,
    );
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
