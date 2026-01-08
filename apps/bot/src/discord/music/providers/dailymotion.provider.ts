import { Injectable, Logger } from '@nestjs/common';
import { regex } from 'arkregex';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

const DAILYMOTION_URL_PATTERN = regex(
  '^https?://(www\\.)?(dailymotion\\.com/video|dai\\.ly)/([a-zA-Z0-9]+)',
);

interface DailymotionVideoResponse {
  id: string;
  title: string;
  duration: number;
  thumbnail_url: string;
  'owner.screenname': string;
}

@MusicProvider()
@Injectable()
export class DailymotionProvider implements MusicProviderInterface {
  public readonly name = 'Dailymotion';
  public readonly type = ProviderType.Dailymotion;
  public readonly priority = 35;

  private readonly logger = new Logger(DailymotionProvider.name);
  private readonly apiBaseUrl = 'https://api.dailymotion.com/video';

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public canHandle(url: string): boolean {
    return DAILYMOTION_URL_PATTERN.test(url);
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const videoId = this.extractVideoId(url);

    if (videoId) {
      try {
        const videoData = await this.fetchVideoData(videoId);

        return {
          url,
          title: videoData.title,
          duration: videoData.duration,
          thumbnail: videoData.thumbnail_url,
          requestedBy,
          provider: this.type,
          artist: videoData['owner.screenname'],
          isLive: false,
          addedAt: new Date(),
        };
      } catch (error) {
        this.logger.warn(
          `Dailymotion API failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    return this.fetchTrackInfoViaYtDlp(url, requestedBy);
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    return this.ytDlpService.getAudioInfo(url);
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    try {
      const searchUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,duration,thumbnail_url,owner.screenname&limit=${String(limit)}`;
      const response = await fetch(searchUrl);

      if (!response.ok) {
        throw new Error(
          `Dailymotion search API returned ${String(response.status)}`,
        );
      }

      const data = (await response.json()) as {
        list: DailymotionVideoResponse[];
      };

      if (data.list.length === 0) {
        return await this.searchViaYtDlp(query, requestedBy, limit);
      }

      return data.list.map((video) => ({
        url: `https://www.dailymotion.com/video/${video.id}`,
        title: video.title,
        duration: video.duration,
        thumbnail: video.thumbnail_url,
        requestedBy,
        provider: this.type,
        artist: video['owner.screenname'],
        isLive: false,
        addedAt: new Date(),
      }));
    } catch (error) {
      this.logger.warn(
        `Dailymotion search failed for "${query}", falling back to yt-dlp`,
        error,
      );
      return this.searchViaYtDlp(query, requestedBy, limit);
    }
  }

  private extractVideoId(url: string): string | null {
    const match = DAILYMOTION_URL_PATTERN.exec(url);
    return match?.[3] ?? null;
  }

  private async fetchVideoData(
    videoId: string,
  ): Promise<DailymotionVideoResponse> {
    const apiUrl = `${this.apiBaseUrl}/${videoId}?fields=id,title,duration,thumbnail_url,owner.screenname`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Dailymotion API returned ${String(response.status)}`);
    }

    return response.json() as Promise<DailymotionVideoResponse>;
  }

  private async fetchTrackInfoViaYtDlp(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const info = await this.ytDlpService.getVideoInfo(url);

    return {
      url: info.url,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      requestedBy,
      provider: this.type,
      artist: this.extractArtist(info.title),
      isLive: info.duration === 0,
      addedAt: new Date(),
    };
  }

  private async searchViaYtDlp(
    query: string,
    requestedBy: string,
    limit: number,
  ): Promise<Track[]> {
    const searchQuery = `ytsearch${String(limit)}:${query} site:dailymotion.com`;
    const info = await this.ytDlpService.search(searchQuery);

    return [
      {
        url: info.url,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        requestedBy,
        provider: this.type,
        artist: this.extractArtist(info.title),
        isLive: false,
        addedAt: new Date(),
      },
    ];
  }

  private extractArtist(title: string): string {
    const parts = title.split(' - ');
    return parts.length > 1 ? (parts[0]?.trim() ?? 'Unknown') : 'Unknown';
  }
}
