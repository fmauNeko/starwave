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

const VIMEO_URL_PATTERN = regex(
  '^https?://(www\\.)?(vimeo\\.com|player\\.vimeo\\.com/video)/(\\d+)',
);

interface VimeoOEmbedResponse {
  title: string;
  duration: number;
  thumbnail_url: string;
  author_name: string;
  video_id: number;
}

@MusicProvider()
@Injectable()
export class VimeoProvider implements MusicProviderInterface {
  public readonly name = 'Vimeo';
  public readonly type = ProviderType.Vimeo;
  public readonly priority = 30;

  private readonly logger = new Logger(VimeoProvider.name);
  private readonly oembedBaseUrl = 'https://vimeo.com/api/oembed.json';

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public canHandle(url: string): boolean {
    return VIMEO_URL_PATTERN.test(url);
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    try {
      const oembedData = await this.fetchOEmbed(url);

      return {
        url,
        title: oembedData.title,
        duration: oembedData.duration,
        thumbnail: oembedData.thumbnail_url,
        requestedBy,
        provider: this.type,
        artist: oembedData.author_name,
        isLive: false,
        addedAt: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `oEmbed API failed for ${url}, falling back to yt-dlp`,
        error,
      );
      return this.fetchTrackInfoViaYtDlp(url, requestedBy);
    }
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    return this.ytDlpService.getAudioInfo(url);
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    const searchQuery = `ytsearch${String(limit)}:${query} site:vimeo.com`;
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

  private async fetchOEmbed(url: string): Promise<VimeoOEmbedResponse> {
    const oembedUrl = `${this.oembedBaseUrl}?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error(`Vimeo oEmbed API returned ${String(response.status)}`);
    }

    return response.json() as Promise<VimeoOEmbedResponse>;
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

  private extractArtist(title: string): string {
    const parts = title.split(' - ');
    return parts.length > 1 ? (parts[0]?.trim() ?? 'Unknown') : 'Unknown';
  }
}
