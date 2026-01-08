import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { regex } from 'arkregex';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import type { Config } from '../../../config/config.type';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

const SPOTIFY_TRACK_URL_PATTERN = regex(
  '^https?://open\\.spotify\\.com/track/([a-zA-Z0-9]+)',
);

const SPOTIFY_PLAYLIST_URL_PATTERN = regex(
  '^https?://open\\.spotify\\.com/playlist/([a-zA-Z0-9]+)',
);

const SPOTIFY_ALBUM_URL_PATTERN = regex(
  '^https?://open\\.spotify\\.com/album/([a-zA-Z0-9]+)',
);

const SPOTIFY_URL_PATTERN = regex(
  '^https?://open\\.spotify\\.com/(track|playlist|album)/([a-zA-Z0-9]+)',
);

@MusicProvider()
@Injectable()
export class SpotifyProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'Spotify';
  public readonly type = ProviderType.Spotify;
  public readonly priority = 15;

  private readonly logger = new Logger(SpotifyProvider.name);
  private spotify: SpotifyApi | null = null;

  public constructor(
    private readonly ytDlpService: YtDlpService,
    private readonly configService: ConfigService<Config>,
  ) {}

  public onModuleInit(): void {
    const spotifyConfig = this.configService.get('spotify', { infer: true });

    if (!spotifyConfig?.clientId || !spotifyConfig.clientSecret) {
      this.logger.warn(
        'Spotify credentials not configured, provider will be disabled',
      );
      return;
    }

    try {
      this.spotify = SpotifyApi.withClientCredentials(
        spotifyConfig.clientId,
        spotifyConfig.clientSecret,
      );

      this.logger.log('Spotify provider initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize Spotify API', error);
      this.spotify = null;
    }
  }

  public canHandle(url: string): boolean {
    return this.spotify !== null && SPOTIFY_URL_PATTERN.test(url);
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    if (!this.spotify) {
      throw new Error('Spotify provider not initialized');
    }

    const trackId = this.extractTrackId(url);
    if (!trackId) {
      throw new Error('Invalid Spotify track URL');
    }

    const spotifyTrack = await this.spotify.tracks.get(trackId);

    const artists = spotifyTrack.artists.map((a) => a.name).join(', ');
    const searchQuery = `${artists} - ${spotifyTrack.name}`;

    const youtubeInfo = await this.ytDlpService.search(
      `ytsearch1:${searchQuery}`,
    );

    return {
      url: youtubeInfo.url,
      title: spotifyTrack.name,
      duration: Math.floor(spotifyTrack.duration_ms / 1000),
      thumbnail: spotifyTrack.album.images[0]?.url ?? '',
      requestedBy,
      provider: this.type,
      artist: artists,
      isLive: false,
      addedAt: new Date(),
    };
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    if (!this.spotify) {
      throw new Error('Spotify provider not initialized');
    }

    const trackId = this.extractTrackId(url);
    if (!trackId) {
      throw new Error('Invalid Spotify track URL');
    }

    const spotifyTrack = await this.spotify.tracks.get(trackId);

    const artists = spotifyTrack.artists.map((a) => a.name).join(', ');
    const searchQuery = `${artists} - ${spotifyTrack.name}`;

    const youtubeInfo = await this.ytDlpService.search(
      `ytsearch1:${searchQuery}`,
    );
    return this.ytDlpService.getAudioInfo(youtubeInfo.url);
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    if (!this.spotify) {
      return this.searchViaYouTube(query, requestedBy, limit);
    }

    try {
      const searchLimit = Math.min(limit, 50) as
        | 1
        | 2
        | 3
        | 4
        | 5
        | 6
        | 7
        | 8
        | 9
        | 10
        | 11
        | 12
        | 13
        | 14
        | 15
        | 16
        | 17
        | 18
        | 19
        | 20
        | 21
        | 22
        | 23
        | 24
        | 25
        | 26
        | 27
        | 28
        | 29
        | 30
        | 31
        | 32
        | 33
        | 34
        | 35
        | 36
        | 37
        | 38
        | 39
        | 40
        | 41
        | 42
        | 43
        | 44
        | 45
        | 46
        | 47
        | 48
        | 49
        | 50;
      const response = await this.spotify.search(
        query,
        ['track'],
        undefined,
        searchLimit,
      );
      const tracks = response.tracks.items;

      if (tracks.length === 0) {
        return await this.searchViaYouTube(query, requestedBy, limit);
      }

      const results: Track[] = [];
      for (const spotifyTrack of tracks) {
        const artists = spotifyTrack.artists.map((a) => a.name).join(', ');
        const searchQuery = `${artists} - ${spotifyTrack.name}`;

        try {
          const youtubeInfo = await this.ytDlpService.search(
            `ytsearch1:${searchQuery}`,
          );

          results.push({
            url: youtubeInfo.url,
            title: spotifyTrack.name,
            duration: Math.floor(spotifyTrack.duration_ms / 1000),
            thumbnail: spotifyTrack.album.images[0]?.url ?? '',
            requestedBy,
            provider: this.type,
            artist: artists,
            isLive: false,
            addedAt: new Date(),
          });
        } catch {
          this.logger.warn(`Failed to find YouTube match for: ${searchQuery}`);
        }
      }

      return results;
    } catch (error) {
      this.logger.warn(`Spotify search failed for "${query}"`, error);
      return this.searchViaYouTube(query, requestedBy, limit);
    }
  }

  public async fetchPlaylist(
    url: string,
    requestedBy: string,
    maxTracks = 30,
  ): Promise<Track[]> {
    if (!this.spotify) {
      throw new Error('Spotify provider not initialized');
    }

    const playlistId = this.extractPlaylistId(url);
    const albumId = this.extractAlbumId(url);

    if (playlistId) {
      return this.fetchSpotifyPlaylist(playlistId, requestedBy, maxTracks);
    }

    if (albumId) {
      return this.fetchSpotifyAlbum(albumId, requestedBy, maxTracks);
    }

    throw new Error('Not a Spotify playlist or album URL');
  }

  private async fetchSpotifyPlaylist(
    playlistId: string,
    requestedBy: string,
    maxTracks: number,
  ): Promise<Track[]> {
    if (!this.spotify) {
      throw new Error('Spotify provider not initialized');
    }

    const playlistLimit = Math.min(maxTracks, 50) as
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6
      | 7
      | 8
      | 9
      | 10
      | 11
      | 12
      | 13
      | 14
      | 15
      | 16
      | 17
      | 18
      | 19
      | 20
      | 21
      | 22
      | 23
      | 24
      | 25
      | 26
      | 27
      | 28
      | 29
      | 30
      | 31
      | 32
      | 33
      | 34
      | 35
      | 36
      | 37
      | 38
      | 39
      | 40
      | 41
      | 42
      | 43
      | 44
      | 45
      | 46
      | 47
      | 48
      | 49
      | 50;
    const response = await this.spotify.playlists.getPlaylistItems(
      playlistId,
      undefined,
      undefined,
      playlistLimit,
    );

    const tracks: Track[] = [];

    for (const item of response.items.slice(0, maxTracks)) {
      if (item.track.type !== 'track') continue;

      const spotifyTrack = item.track;
      const artists = spotifyTrack.artists.map((a) => a.name).join(', ');
      const searchQuery = `${artists} - ${spotifyTrack.name}`;

      try {
        const youtubeInfo = await this.ytDlpService.search(
          `ytsearch1:${searchQuery}`,
        );

        tracks.push({
          url: youtubeInfo.url,
          title: spotifyTrack.name,
          duration: Math.floor(spotifyTrack.duration_ms / 1000),
          thumbnail: spotifyTrack.album.images[0]?.url ?? '',
          requestedBy,
          provider: this.type,
          artist: artists,
          isLive: false,
          addedAt: new Date(),
        });
      } catch {
        this.logger.warn(`Failed to find YouTube match for: ${searchQuery}`);
      }
    }

    return tracks;
  }

  private async fetchSpotifyAlbum(
    albumId: string,
    requestedBy: string,
    maxTracks: number,
  ): Promise<Track[]> {
    if (!this.spotify) {
      throw new Error('Spotify provider not initialized');
    }

    const album = await this.spotify.albums.get(albumId);

    const tracks: Track[] = [];

    for (const spotifyTrack of album.tracks.items.slice(0, maxTracks)) {
      const artists = spotifyTrack.artists.map((a) => a.name).join(', ');
      const searchQuery = `${artists} - ${spotifyTrack.name}`;

      try {
        const youtubeInfo = await this.ytDlpService.search(
          `ytsearch1:${searchQuery}`,
        );

        tracks.push({
          url: youtubeInfo.url,
          title: spotifyTrack.name,
          duration: Math.floor(spotifyTrack.duration_ms / 1000),
          thumbnail: album.images[0]?.url ?? '',
          requestedBy,
          provider: this.type,
          artist: artists,
          isLive: false,
          addedAt: new Date(),
        });
      } catch {
        this.logger.warn(`Failed to find YouTube match for: ${searchQuery}`);
      }
    }

    return tracks;
  }

  private extractTrackId(url: string): string | null {
    const match = SPOTIFY_TRACK_URL_PATTERN.exec(url);
    return match?.[1] ?? null;
  }

  private extractPlaylistId(url: string): string | null {
    const match = SPOTIFY_PLAYLIST_URL_PATTERN.exec(url);
    return match?.[1] ?? null;
  }

  private extractAlbumId(url: string): string | null {
    const match = SPOTIFY_ALBUM_URL_PATTERN.exec(url);
    return match?.[1] ?? null;
  }

  private async searchViaYouTube(
    query: string,
    requestedBy: string,
    limit: number,
  ): Promise<Track[]> {
    const searchQuery = `ytsearch${String(limit)}:${query}`;
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
