import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import { BandcampFetch } from 'bandcamp-fetch';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

const BANDCAMP_TRACK_URL_PATTERN = regex(
  '^https?://([a-zA-Z0-9-]+)\\.bandcamp\\.com/track/([a-zA-Z0-9-]+)',
);

const BANDCAMP_ALBUM_URL_PATTERN = regex(
  '^https?://([a-zA-Z0-9-]+)\\.bandcamp\\.com/album/([a-zA-Z0-9-]+)',
);

const BANDCAMP_URL_PATTERN = regex(
  '^https?://([a-zA-Z0-9-]+)\\.bandcamp\\.com/(track|album)/([a-zA-Z0-9-]+)',
);

@MusicProvider()
@Injectable()
export class BandcampProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'Bandcamp';
  public readonly type = ProviderType.Bandcamp;
  public readonly priority = 25;

  private readonly logger = new Logger(BandcampProvider.name);
  private bandcamp: BandcampFetch | null = null;

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public onModuleInit(): void {
    try {
      this.bandcamp = new BandcampFetch();
      this.logger.log('Bandcamp provider initialized with native API');
    } catch (error) {
      this.logger.warn(
        'Failed to initialize Bandcamp native API, falling back to yt-dlp',
        error,
      );
    }
  }

  public canHandle(url: string): boolean {
    return BANDCAMP_URL_PATTERN.test(url);
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    if (this.bandcamp && BANDCAMP_TRACK_URL_PATTERN.test(url)) {
      try {
        const trackData = await this.bandcamp.track.getInfo({ trackUrl: url });

        const track: Track = {
          url: trackData.url ?? url,
          title: trackData.name,
          duration: Math.floor(trackData.duration ?? 0),
          thumbnail: trackData.imageUrl ?? '',
          requestedBy,
          provider: this.type,
          artist: trackData.artist?.name ?? 'Unknown',
          isLive: false,
          addedAt: new Date(),
        };

        if (trackData.streamUrl) {
          track.streamUrl = trackData.streamUrl;
        }

        return track;
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
    if (this.bandcamp && BANDCAMP_TRACK_URL_PATTERN.test(url)) {
      try {
        const trackData = await this.bandcamp.track.getInfo({ trackUrl: url });

        if (trackData.streamUrl) {
          return {
            url: trackData.streamUrl,
            codec: 'mp3',
            container: 'mp3',
          };
        }
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
    if (this.bandcamp) {
      try {
        const results = await this.bandcamp.search.tracks({ query });

        if (results.items.length === 0) {
          return await this.searchViaYtDlp(query, requestedBy, limit);
        }

        const tracks: Track[] = [];
        for (const item of results.items.slice(0, limit)) {
          try {
            const trackInfo = await this.bandcamp.track.getInfo({
              trackUrl: item.url,
            });

            const track: Track = {
              url: trackInfo.url ?? item.url,
              title: trackInfo.name,
              duration: Math.floor(trackInfo.duration ?? 0),
              thumbnail: trackInfo.imageUrl ?? '',
              requestedBy,
              provider: this.type,
              artist: trackInfo.artist?.name ?? item.artist ?? 'Unknown',
              isLive: false,
              addedAt: new Date(),
            };

            if (trackInfo.streamUrl) {
              track.streamUrl = trackInfo.streamUrl;
            }

            tracks.push(track);
          } catch {
            tracks.push({
              url: item.url,
              title: item.name,
              duration: 0,
              thumbnail: item.imageUrl ?? '',
              requestedBy,
              provider: this.type,
              artist: item.artist ?? 'Unknown',
              isLive: false,
              addedAt: new Date(),
            });
          }
        }

        return tracks;
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
    if (!BANDCAMP_ALBUM_URL_PATTERN.test(url)) {
      throw new Error('Not a Bandcamp album URL');
    }

    if (this.bandcamp) {
      try {
        const album = await this.bandcamp.album.getInfo({ albumUrl: url });

        if (!album.tracks || album.tracks.length === 0) {
          return await this.ytDlpService.getPlaylistTracks(
            url,
            requestedBy,
            maxTracks,
            this.type,
          );
        }

        const tracks = album.tracks;
        return tracks.slice(0, maxTracks).map((albumTrack) => {
          const track: Track = {
            url: albumTrack.url ?? url,
            title: albumTrack.name,
            duration: Math.floor(albumTrack.duration ?? 0),
            thumbnail: album.imageUrl ?? '',
            requestedBy,
            provider: this.type,
            artist: album.artist?.name ?? 'Unknown',
            isLive: false,
            addedAt: new Date(),
          };

          if (albumTrack.streamUrl) {
            track.streamUrl = albumTrack.streamUrl;
          }

          return track;
        });
      } catch (error) {
        this.logger.warn(
          `Native album fetch failed for ${url}, falling back to yt-dlp`,
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
    const searchQuery = `ytsearch${String(limit)}:${query} bandcamp`;
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
