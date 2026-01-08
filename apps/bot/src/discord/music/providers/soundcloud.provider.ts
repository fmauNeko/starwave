import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import SoundCloud from 'soundcloud.ts';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

const SOUNDCLOUD_URL_PATTERN = regex(
  '^https?://(soundcloud\\.com|snd\\.sc)/([a-zA-Z0-9_-]+)/([a-zA-Z0-9_-]+)',
);

const SOUNDCLOUD_PLAYLIST_PATTERN = regex(
  '^https?://(soundcloud\\.com|snd\\.sc)/([a-zA-Z0-9_-]+)/sets/([a-zA-Z0-9_-]+)',
);

@MusicProvider()
@Injectable()
export class SoundCloudProvider
  implements MusicProviderInterface, OnModuleInit
{
  public readonly name = 'SoundCloud';
  public readonly type = ProviderType.SoundCloud;
  public readonly priority = 20;

  private readonly logger = new Logger(SoundCloudProvider.name);
  private soundcloud: SoundCloud | null = null;

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public onModuleInit(): void {
    try {
      this.soundcloud = new SoundCloud();
      this.logger.log('SoundCloud provider initialized with native API');
    } catch (error) {
      this.logger.warn(
        'Failed to initialize SoundCloud native API, falling back to yt-dlp',
        error,
      );
    }
  }

  public canHandle(url: string): boolean {
    return SOUNDCLOUD_URL_PATTERN.test(url);
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    if (this.soundcloud) {
      try {
        const track = await this.soundcloud.tracks.get(url);

        return {
          url: track.permalink_url,
          title: track.title,
          duration: Math.floor(track.full_duration / 1000),
          thumbnail: track.artwork_url.replace('-large', '-t500x500'),
          requestedBy,
          provider: this.type,
          artist: track.user.username,
          isLive: false,
          addedAt: new Date(),
        };
      } catch (error) {
        this.logger.warn(
          `Native API failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    return this.fetchTrackInfoViaYtDlp(url, requestedBy);
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    if (this.soundcloud) {
      try {
        const track = await this.soundcloud.tracks.get(url);
        const streamUrl = await this.soundcloud.util.streamLink(track);

        return {
          url: streamUrl,
          codec: 'aac',
          container: 'hls',
        };
      } catch (error) {
        this.logger.warn(
          `Native stream fetch failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    return this.ytDlpService.getAudioInfo(url);
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    if (this.soundcloud) {
      try {
        const results = await this.soundcloud.tracks.search({
          q: query,
          limit,
        });

        return results.collection.map((track) => ({
          url: track.permalink_url,
          title: track.title,
          duration: Math.floor(track.full_duration / 1000),
          thumbnail: track.artwork_url.replace('-large', '-t500x500'),
          requestedBy,
          provider: this.type,
          artist: track.user.username,
          isLive: false,
          addedAt: new Date(),
        }));
      } catch (error) {
        this.logger.warn(
          `Native search failed for "${query}", falling back to yt-dlp`,
          error,
        );
      }
    }

    return this.searchViaYtDlp(query, requestedBy, limit);
  }

  public async fetchPlaylist(
    url: string,
    requestedBy: string,
    maxTracks = 30,
  ): Promise<Track[]> {
    if (!SOUNDCLOUD_PLAYLIST_PATTERN.test(url)) {
      throw new Error('Not a SoundCloud playlist URL');
    }

    if (this.soundcloud) {
      try {
        const playlist = await this.soundcloud.playlists.get(url);

        return playlist.tracks.slice(0, maxTracks).map((track) => ({
          url: track.permalink_url,
          title: track.title,
          duration: Math.floor(track.full_duration / 1000),
          thumbnail: track.artwork_url.replace('-large', '-t500x500'),
          requestedBy,
          provider: this.type,
          artist: track.user.username,
          isLive: false,
          addedAt: new Date(),
        }));
      } catch (error) {
        this.logger.warn(
          `Native playlist fetch failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    return this.ytDlpService.getPlaylistTracks(
      url,
      requestedBy,
      maxTracks,
      this.type,
    );
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
    const searchQuery = `scsearch${String(limit)}:${query}`;
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
