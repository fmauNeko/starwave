# Phase 1: Multi-Provider Implementation (API-First)

## Overview

This phase adds support for additional music providers beyond YouTube, **prioritizing native APIs over yt-dlp** for better reliability, metadata, and rate limit handling.

| Provider        | API Strategy              | Stream Strategy      | Search        |
| --------------- | ------------------------- | -------------------- | ------------- |
| **SoundCloud**  | `soundcloud.ts` (native)  | Native API (AAC HLS) | Native API    |
| **Bandcamp**    | `bandcamp-fetch` (native) | Native API (MP3-128) | Native API    |
| **Vimeo**       | oEmbed + Official API     | yt-dlp fallback      | Not supported |
| **Dailymotion** | REST API (native)         | yt-dlp fallback      | Native API    |
| **Spotify**     | `spotify-web-api-node`    | Resolves to YouTube  | N/A           |

### Design Principles

1. **API-First**: Use native APIs for metadata and search - better rate limits, more metadata
2. **yt-dlp as Fallback**: Only use yt-dlp for streaming when native APIs don't provide stream URLs
3. **Graceful Degradation**: If native API fails, fall back to yt-dlp for the entire operation

## Architecture

### Provider Type Enum

```typescript
// apps/bot/src/discord/music/providers/provider-types.ts

export enum ProviderType {
  YouTube = 'youtube',
  SoundCloud = 'soundcloud',
  Bandcamp = 'bandcamp',
  Vimeo = 'vimeo',
  Dailymotion = 'dailymotion',
  Spotify = 'spotify',
  Radio = 'radio',
  Direct = 'direct', // Direct URLs (mp3, etc.)
}

export const PROVIDER_COLORS: Record<ProviderType, number> = {
  [ProviderType.YouTube]: 0xff0000,
  [ProviderType.SoundCloud]: 0xf35f2b,
  [ProviderType.Bandcamp]: 0x33a1c1,
  [ProviderType.Vimeo]: 0x3abae8,
  [ProviderType.Dailymotion]: 0x00d2f3,
  [ProviderType.Spotify]: 0x1db954,
  [ProviderType.Radio]: 0xc45c60,
  [ProviderType.Direct]: 0x31aff2,
};

export const PROVIDER_NAMES: Record<ProviderType, string> = {
  [ProviderType.YouTube]: 'YouTube',
  [ProviderType.SoundCloud]: 'SoundCloud',
  [ProviderType.Bandcamp]: 'Bandcamp',
  [ProviderType.Vimeo]: 'Vimeo',
  [ProviderType.Dailymotion]: 'Dailymotion',
  [ProviderType.Spotify]: 'Spotify',
  [ProviderType.Radio]: 'Radio',
  [ProviderType.Direct]: 'Direct URL',
};
```

### Extended Track Interface

```typescript
// apps/bot/src/discord/music/music-queue.ts (update)

import { ProviderType } from './providers/provider-types';

export interface Track {
  url: string;
  title: string;
  duration: number; // seconds, 0 for live streams
  thumbnail: string;
  requestedBy: string;
  // New fields
  provider: ProviderType;
  artist?: string; // Channel/artist name
  isLive?: boolean;
  addedAt: Date;
  // Stream URL (may expire, fetched on-demand)
  streamUrl?: string;
  streamExpiresAt?: Date;
}
```

### Extended MusicProvider Interface

```typescript
// apps/bot/src/discord/music/providers/music-provider.interface.ts (update)

import { ProviderType } from './provider-types';

export interface AudioInfo {
  url: string;
  codec: string;
  container: string;
  expiresAt?: Date; // Some providers have expiring URLs
}

export interface SearchResult {
  tracks: Track[];
  provider: ProviderType;
}

export interface MusicProvider {
  readonly name: string;
  readonly type: ProviderType;
  readonly priority: number; // Lower = checked first for URL matching

  canHandle(url: string): boolean;

  fetchTrackInfo(url: string, requestedBy: string): Promise<Track>;

  getAudioInfo(url: string): Promise<AudioInfo>;

  search(query: string, requestedBy: string, limit?: number): Promise<Track[]>;

  // Optional: For providers that support playlists
  fetchPlaylist?(
    url: string,
    requestedBy: string,
    maxTracks?: number,
  ): Promise<Track[]>;

  // Optional: Refresh stream URL if expired
  refreshStreamUrl?(track: Track): Promise<string>;
}

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
```

---

## Provider Implementations

### 1. SoundCloud Provider (Native API via soundcloud.ts)

**Package**: `soundcloud.ts` (v0.6.3) - TypeScript, actively maintained, handles Client ID automatically

**Capabilities**:

- Metadata via API
- Search via API
- Stream URLs via API (AAC HLS after Dec 2025)
- Playlists via API

**Limitations**:

- No official API keys issued anymore - uses extracted Client ID
- After Dec 31, 2025: Only AAC HLS streams work (MP3 deprecated)

```typescript
// apps/bot/src/discord/music/providers/soundcloud.provider.ts

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

// Matches: soundcloud.com/*, snd.sc/*
const SOUNDCLOUD_URL_PATTERN = regex(
  '^https?:\\/\\/(soundcloud\\.com|snd\\.sc)\\/([a-zA-Z0-9_-]+)\\/([a-zA-Z0-9_-]+)',
);

// Matches: soundcloud.com/*/sets/*
const SOUNDCLOUD_PLAYLIST_PATTERN = regex(
  '^https?:\\/\\/(soundcloud\\.com|snd\\.sc)\\/([a-zA-Z0-9_-]+)\\/sets\\/([a-zA-Z0-9_-]+)',
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

  public async onModuleInit(): Promise<void> {
    try {
      // soundcloud.ts automatically extracts and manages Client ID
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
    // Try native API first
    if (this.soundcloud) {
      try {
        const track = await this.soundcloud.tracks.getV2(url);

        return {
          url: track.permalink_url,
          title: track.title,
          duration: Math.floor(track.full_duration / 1000), // ms to seconds
          thumbnail:
            track.artwork_url?.replace('-large', '-t500x500') ??
            track.user.avatar_url ??
            '',
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

    // Fallback to yt-dlp
    return this.fetchTrackInfoViaYtDlp(url, requestedBy);
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    // Try native API first for stream URL
    if (this.soundcloud) {
      try {
        const track = await this.soundcloud.tracks.getV2(url);
        // Get progressive stream (AAC HLS after Dec 2025)
        const streamUrl = await this.soundcloud.util.streamLink(track);

        return {
          url: streamUrl,
          codec: 'aac', // SoundCloud uses AAC HLS
          container: 'hls',
          // SoundCloud stream URLs don't typically expire quickly
        };
      } catch (error) {
        this.logger.warn(
          `Native stream fetch failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    // Fallback to yt-dlp
    return this.ytDlpService.getAudioInfo(url);
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    // Try native API first
    if (this.soundcloud) {
      try {
        const results = await this.soundcloud.tracks.searchV2({
          q: query,
          limit,
        });

        return results.collection.map((track) => ({
          url: track.permalink_url,
          title: track.title,
          duration: Math.floor(track.full_duration / 1000),
          thumbnail:
            track.artwork_url?.replace('-large', '-t500x500') ??
            track.user.avatar_url ??
            '',
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

    // Fallback to yt-dlp scsearch
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

    // Try native API first
    if (this.soundcloud) {
      try {
        const playlist = await this.soundcloud.playlists.getV2(url);

        return playlist.tracks.slice(0, maxTracks).map((track) => ({
          url: track.permalink_url,
          title: track.title,
          duration: Math.floor(track.full_duration / 1000),
          thumbnail:
            track.artwork_url?.replace('-large', '-t500x500') ??
            track.user.avatar_url ??
            '',
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

    // Fallback to yt-dlp
    return this.ytDlpService.getPlaylistTracks(
      url,
      requestedBy,
      maxTracks,
      this.type,
    );
  }

  // yt-dlp fallback methods
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
    const searchQuery = `scsearch${limit}:${query}`;
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
```

### 2. Bandcamp Provider (Native API via bandcamp-fetch)

**Package**: `bandcamp-fetch` (v3.0.0) - TypeScript, actively maintained (2026), built-in rate limiting

**Capabilities**:

- Metadata via API
- Search via API
- Stream URLs via API (MP3-128, can expire)
- Albums as playlists via API
- Cookie auth for HQ streams (optional)

**Limitations**:

- No official public API (uses web scraping under the hood)
- Stream URLs can expire - has `refreshStreamUrl` method

```typescript
// apps/bot/src/discord/music/providers/bandcamp.provider.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { regex } from 'arkregex';
import BandcampFetch, { Track as BandcampTrack } from 'bandcamp-fetch';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

// Matches: *.bandcamp.com/track/* or *.bandcamp.com/album/*
const BANDCAMP_URL_PATTERN = regex(
  '^https?:\\/\\/([a-zA-Z0-9_-]+)\\.bandcamp\\.com\\/(track|album)\\/([a-zA-Z0-9_-]+)',
);

@MusicProvider()
@Injectable()
export class BandcampProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'Bandcamp';
  public readonly type = ProviderType.Bandcamp;
  public readonly priority = 30;

  private readonly logger = new Logger(BandcampProvider.name);
  private bandcamp: typeof BandcampFetch | null = null;

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public onModuleInit(): void {
    try {
      // bandcamp-fetch has built-in rate limiting
      this.bandcamp = BandcampFetch;
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
    // Try native API first
    if (this.bandcamp) {
      try {
        const info = await this.bandcamp.getTrackInfo(url);

        return {
          url: info.url ?? url,
          title: info.name ?? 'Unknown Title',
          duration: info.duration ?? 0,
          thumbnail: info.imageUrl ?? '',
          requestedBy,
          provider: this.type,
          artist: info.artist?.name ?? this.extractArtistFromUrl(url),
          isLive: false,
          addedAt: new Date(),
          // Store stream URL if available
          streamUrl: info.streamUrl,
        };
      } catch (error) {
        this.logger.warn(
          `Native API failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    // Fallback to yt-dlp
    return this.fetchTrackInfoViaYtDlp(url, requestedBy);
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    // Try native API first
    if (this.bandcamp) {
      try {
        const info = await this.bandcamp.getTrackInfo(url);

        if (info.streamUrl) {
          return {
            url: info.streamUrl,
            codec: 'mp3',
            container: 'mp3',
            // Bandcamp stream URLs can expire
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // ~1 hour
          };
        }
      } catch (error) {
        this.logger.warn(
          `Native stream fetch failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    // Fallback to yt-dlp
    return this.ytDlpService.getAudioInfo(url);
  }

  public async refreshStreamUrl(track: Track): Promise<string> {
    if (!this.bandcamp) {
      throw new Error('Bandcamp API not available');
    }

    const info = await this.bandcamp.getTrackInfo(track.url);
    if (!info.streamUrl) {
      throw new Error('Could not refresh stream URL');
    }

    return info.streamUrl;
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    // Try native API first
    if (this.bandcamp) {
      try {
        const results = await this.bandcamp.search({
          query,
          itemType: 'track',
          limit,
        });

        const tracks: Track[] = [];
        for (const result of results.items) {
          if (result.type === 'track') {
            tracks.push({
              url: result.url ?? '',
              title: result.name ?? 'Unknown',
              duration: 0, // Search results don't include duration
              thumbnail: result.imageUrl ?? '',
              requestedBy,
              provider: this.type,
              artist: result.artist ?? 'Unknown',
              isLive: false,
              addedAt: new Date(),
            });
          }
        }

        return tracks;
      } catch (error) {
        this.logger.warn(
          `Native search failed for "${query}", falling back to YouTube`,
          error,
        );
      }
    }

    // Fallback: Search YouTube with "bandcamp" keyword
    // (yt-dlp doesn't support Bandcamp search directly)
    return this.searchViaYouTube(query, requestedBy, limit);
  }

  public async fetchPlaylist(
    url: string,
    requestedBy: string,
    maxTracks = 30,
  ): Promise<Track[]> {
    if (!url.includes('/album/')) {
      throw new Error('Not a Bandcamp album URL');
    }

    // Try native API first
    if (this.bandcamp) {
      try {
        const album = await this.bandcamp.getAlbumInfo(url);

        return (album.tracks ?? []).slice(0, maxTracks).map((track) => ({
          url: track.url ?? url,
          title: track.name ?? 'Unknown',
          duration: track.duration ?? 0,
          thumbnail: album.imageUrl ?? '',
          requestedBy,
          provider: this.type,
          artist: album.artist?.name ?? this.extractArtistFromUrl(url),
          isLive: false,
          addedAt: new Date(),
          streamUrl: track.streamUrl,
        }));
      } catch (error) {
        this.logger.warn(
          `Native album fetch failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    // Fallback to yt-dlp
    return this.ytDlpService.getPlaylistTracks(
      url,
      requestedBy,
      maxTracks,
      this.type,
    );
  }

  // Fallback methods
  private async fetchTrackInfoViaYtDlp(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const info = await this.ytDlpService.getVideoInfo(url);
    const artist = this.extractArtistFromUrl(url);

    return {
      url: info.url,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      requestedBy,
      provider: this.type,
      artist,
      isLive: false,
      addedAt: new Date(),
    };
  }

  private async searchViaYouTube(
    query: string,
    requestedBy: string,
    limit: number,
  ): Promise<Track[]> {
    this.logger.debug(`Searching Bandcamp via YouTube for: ${query}`);

    const searchQuery = `ytsearch${limit}:${query} bandcamp`;
    const info = await this.ytDlpService.search(searchQuery);

    return [
      {
        url: info.url,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        requestedBy,
        provider: ProviderType.YouTube, // Falls back to YouTube
        isLive: false,
        addedAt: new Date(),
      },
    ];
  }

  private extractArtistFromUrl(url: string): string {
    const match = BANDCAMP_URL_PATTERN.exec(url);
    return match?.[1]?.replace(/-/g, ' ') ?? 'Unknown';
  }
}
```

### 3. Vimeo Provider (oEmbed + Official API)

**Strategy**:

- **oEmbed API** (no auth): Metadata for public videos
- **Official API** (OAuth required): Stream URLs (require `video_files` scope)
- **yt-dlp fallback**: Streaming when no OAuth configured

**Packages**:

- `vimeo` (official npm package) - optional, for authenticated access

**Capabilities**:

- Metadata via oEmbed (no auth, no rate limit concerns)
- Stream URLs require OAuth (Pro+ plan recommended)
- Channels/Albums as playlists (with OAuth)

**Limitations**:

- Stream URLs require OAuth 2.0 with `video_files` scope
- URLs expire (typically 1-2 hours)
- Rate limits: 25-2500 req/min based on plan

```typescript
// apps/bot/src/discord/music/providers/vimeo.provider.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { regex } from 'arkregex';
import type { Config } from '../../../config/config.type';
import type { Track } from '../music-queue';
import { YtDlpService } from '../yt-dlp.service';
import { MusicProvider } from './music-provider.decorator';
import { ProviderType } from './provider-types';
import type {
  AudioInfo,
  MusicProvider as MusicProviderInterface,
} from './music-provider.interface';

// oEmbed response type
interface VimeoOEmbed {
  type: string;
  title: string;
  description: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  duration: number;
  author_name: string;
  author_url: string;
  video_id: number;
}

// Matches: vimeo.com/*, player.vimeo.com/video/*
const VIMEO_URL_PATTERN = regex(
  '(?:www\\.|player\\.)?vimeo\\.com\\/(?:channels\\/(?:\\w+\\/)?|groups\\/(?:[^\\/]*)\\/videos\\/|album\\/(?:\\d+)\\/video\\/|video\\/|)(\\d+)(?:[a-zA-Z0-9_-]+)?',
);

@MusicProvider()
@Injectable()
export class VimeoProvider implements MusicProviderInterface, OnModuleInit {
  public readonly name = 'Vimeo';
  public readonly type = ProviderType.Vimeo;
  public readonly priority = 40;

  private readonly logger = new Logger(VimeoProvider.name);
  private readonly oEmbedEndpoint = 'https://vimeo.com/api/oembed.json';
  private vimeoApi: unknown = null; // Vimeo official SDK (optional)

  public constructor(
    private readonly configService: ConfigService<Config>,
    private readonly ytDlpService: YtDlpService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const vimeoConfig = this.configService.get('vimeo', { infer: true });

    if (vimeoConfig?.accessToken) {
      try {
        // Dynamic import to avoid requiring the package if not configured
        const { Vimeo } = await import('vimeo');
        this.vimeoApi = new Vimeo(
          vimeoConfig.clientId ?? '',
          vimeoConfig.clientSecret ?? '',
          vimeoConfig.accessToken,
        );
        this.logger.log('Vimeo provider initialized with OAuth (full access)');
      } catch (error) {
        this.logger.warn('Vimeo SDK not available, using oEmbed only', error);
      }
    } else {
      this.logger.log(
        'Vimeo provider initialized with oEmbed only (no OAuth configured)',
      );
    }
  }

  public canHandle(url: string): boolean {
    return VIMEO_URL_PATTERN.test(url);
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid Vimeo URL');
    }

    // oEmbed API - no auth required for public videos
    try {
      const oEmbed = await this.fetchOEmbed(url);

      return {
        url: `https://vimeo.com/${videoId}`,
        title: oEmbed.title,
        duration: oEmbed.duration,
        thumbnail: oEmbed.thumbnail_url,
        requestedBy,
        provider: this.type,
        artist: oEmbed.author_name,
        isLive: false, // Vimeo doesn't really do live for music
        addedAt: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `oEmbed failed for ${url}, falling back to yt-dlp`,
        error,
      );
      return this.fetchTrackInfoViaYtDlp(url, requestedBy);
    }
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    // If we have OAuth, try to get direct stream URL
    if (this.vimeoApi) {
      try {
        const videoId = this.extractVideoId(url);
        const streamUrl = await this.fetchStreamUrlViaApi(videoId!);

        if (streamUrl) {
          return {
            url: streamUrl,
            codec: 'aac',
            container: 'mp4',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // ~1 hour
          };
        }
      } catch (error) {
        this.logger.warn(
          `OAuth stream fetch failed for ${url}, falling back to yt-dlp`,
          error,
        );
      }
    }

    // Fallback to yt-dlp (always works for public videos)
    return this.ytDlpService.getAudioInfo(url);
  }

  public async search(
    _query: string,
    _requestedBy: string,
    _limit = 1,
  ): Promise<Track[]> {
    // Vimeo search requires OAuth and is music-focused content rare
    // Return empty - search not supported for Vimeo
    this.logger.debug('Vimeo search not supported - use direct URLs');
    return [];
  }

  // Private methods
  private async fetchOEmbed(url: string): Promise<VimeoOEmbed> {
    const oEmbedUrl = `${this.oEmbedEndpoint}?url=${encodeURIComponent(url)}`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      throw new Error(`oEmbed request failed: ${response.status}`);
    }

    return response.json() as Promise<VimeoOEmbed>;
  }

  private async fetchStreamUrlViaApi(videoId: string): Promise<string | null> {
    // This requires OAuth with video_files scope
    // Implementation depends on your Vimeo API plan
    return new Promise((resolve, reject) => {
      const api = this.vimeoApi as {
        request: (
          options: { path: string; method: string },
          callback: (error: Error | null, body: unknown) => void,
        ) => void;
      };

      api.request(
        {
          path: `/videos/${videoId}`,
          method: 'GET',
        },
        (error, body) => {
          if (error) {
            reject(error);
            return;
          }

          const video = body as {
            files?: { link: string; quality: string }[];
          };

          // Get best quality audio-capable file
          const file = video.files?.find(
            (f) => f.quality === 'hd' || f.quality === 'sd',
          );
          resolve(file?.link ?? null);
        },
      );
    });
  }

  private async fetchTrackInfoViaYtDlp(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const info = await this.ytDlpService.getVideoInfo(url);

    return {
      url: this.getCanonicalUrl(url),
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      requestedBy,
      provider: this.type,
      isLive: info.duration === 0,
      addedAt: new Date(),
    };
  }

  private extractVideoId(url: string): string | null {
    const match = VIMEO_URL_PATTERN.exec(url);
    return match?.[1] ?? null;
  }

  private getCanonicalUrl(url: string): string {
    const videoId = this.extractVideoId(url);
    return videoId ? `https://vimeo.com/${videoId}` : url;
  }
}
```

### 4. Dailymotion Provider (Native REST API)

**Strategy**:

- **Public REST API**: Metadata and search (no auth required)
- **yt-dlp fallback**: Streaming (native stream URLs require Pro plan)

**API Endpoint**: `https://api.dailymotion.com`

**Capabilities**:

- Metadata via REST API (no auth)
- Search via REST API (no auth)
- Playlists via REST API (no auth)

**Limitations**:

- Stream URLs require Pro plan + Private API Key
- Use yt-dlp for streaming (works without Pro plan)

```typescript
// apps/bot/src/discord/music/providers/dailymotion.provider.ts

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

// API response types
interface DailymotionVideo {
  id: string;
  title: string;
  duration: number;
  thumbnail_360_url: string;
  'owner.screenname'?: string;
  owner?: { screenname: string };
}

interface DailymotionSearchResponse {
  list: DailymotionVideo[];
  has_more: boolean;
  page: number;
}

// Matches: dailymotion.com/video/*, dai.ly/*
const DAILYMOTION_URL_PATTERN = regex(
  '^https?:\\/\\/(?:www\\.)?(?:dai\\.ly\\/|dailymotion\\.com\\/(?:.+?video=|(?:video|hub)\\/))([a-z0-9]+)',
);

// Matches: dailymotion.com/playlist/*
const DAILYMOTION_PLAYLIST_PATTERN = regex(
  '^https?:\\/\\/(?:www\\.)?dailymotion\\.com\\/playlist\\/([a-z0-9]+)',
);

@MusicProvider()
@Injectable()
export class DailymotionProvider
  implements MusicProviderInterface, OnModuleInit
{
  public readonly name = 'Dailymotion';
  public readonly type = ProviderType.Dailymotion;
  public readonly priority = 50;

  private readonly logger = new Logger(DailymotionProvider.name);
  private readonly apiBase = 'https://api.dailymotion.com';

  public constructor(private readonly ytDlpService: YtDlpService) {}

  public onModuleInit(): void {
    this.logger.log('Dailymotion provider initialized with native API');
  }

  public canHandle(url: string): boolean {
    return (
      DAILYMOTION_URL_PATTERN.test(url) ||
      DAILYMOTION_PLAYLIST_PATTERN.test(url)
    );
  }

  public async fetchTrackInfo(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid Dailymotion URL');
    }

    // Try native API first
    try {
      const video = await this.fetchVideoInfo(videoId);

      return {
        url: `https://dai.ly/${videoId}`,
        title: video.title,
        duration: video.duration,
        thumbnail: video.thumbnail_360_url,
        requestedBy,
        provider: this.type,
        artist:
          video.owner?.screenname ?? video['owner.screenname'] ?? 'Unknown',
        isLive: false,
        addedAt: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `Native API failed for ${url}, falling back to yt-dlp`,
        error,
      );
      return this.fetchTrackInfoViaYtDlp(url, requestedBy);
    }
  }

  public async getAudioInfo(url: string): Promise<AudioInfo> {
    // Native API stream URLs require Pro plan
    // Always use yt-dlp for streaming
    return this.ytDlpService.getAudioInfo(url);
  }

  public async search(
    query: string,
    requestedBy: string,
    limit = 1,
  ): Promise<Track[]> {
    this.logger.debug(`Searching Dailymotion for: ${query}`);

    try {
      const searchUrl = new URL(`${this.apiBase}/videos`);
      searchUrl.searchParams.set('search', query);
      searchUrl.searchParams.set(
        'fields',
        'id,title,duration,thumbnail_360_url,owner.screenname',
      );
      searchUrl.searchParams.set('limit', String(limit));
      searchUrl.searchParams.set('sort', 'relevance');

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = (await response.json()) as DailymotionSearchResponse;

      return data.list.map((video) => ({
        url: `https://dai.ly/${video.id}`,
        title: video.title,
        duration: video.duration,
        thumbnail: video.thumbnail_360_url,
        requestedBy,
        provider: this.type,
        artist:
          video.owner?.screenname ?? video['owner.screenname'] ?? 'Unknown',
        isLive: false,
        addedAt: new Date(),
      }));
    } catch (error) {
      this.logger.warn(
        `Native search failed for "${query}", falling back to YouTube`,
        error,
      );

      // Fallback to YouTube search
      const searchQuery = `ytsearch${limit}:${query} dailymotion`;
      const info = await this.ytDlpService.search(searchQuery);

      return [
        {
          url: info.url,
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail,
          requestedBy,
          provider: ProviderType.YouTube,
          isLive: false,
          addedAt: new Date(),
        },
      ];
    }
  }

  public async fetchPlaylist(
    url: string,
    requestedBy: string,
    maxTracks = 30,
  ): Promise<Track[]> {
    const playlistId = this.extractPlaylistId(url);
    if (!playlistId) {
      throw new Error('Not a Dailymotion playlist URL');
    }

    // Try native API first
    try {
      const playlistUrl = new URL(
        `${this.apiBase}/playlist/${playlistId}/videos`,
      );
      playlistUrl.searchParams.set(
        'fields',
        'id,title,duration,thumbnail_360_url,owner.screenname',
      );
      playlistUrl.searchParams.set('limit', String(maxTracks));

      const response = await fetch(playlistUrl.toString());

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = (await response.json()) as DailymotionSearchResponse;

      return data.list.map((video) => ({
        url: `https://dai.ly/${video.id}`,
        title: video.title,
        duration: video.duration,
        thumbnail: video.thumbnail_360_url,
        requestedBy,
        provider: this.type,
        artist:
          video.owner?.screenname ?? video['owner.screenname'] ?? 'Unknown',
        isLive: false,
        addedAt: new Date(),
      }));
    } catch (error) {
      this.logger.warn(
        `Native playlist fetch failed for ${url}, falling back to yt-dlp`,
        error,
      );
    }

    // Fallback to yt-dlp
    return this.ytDlpService.getPlaylistTracks(
      url,
      requestedBy,
      maxTracks,
      this.type,
    );
  }

  // Private methods
  private async fetchVideoInfo(videoId: string): Promise<DailymotionVideo> {
    const videoUrl = new URL(`${this.apiBase}/video/${videoId}`);
    videoUrl.searchParams.set(
      'fields',
      'id,title,duration,thumbnail_360_url,owner.screenname',
    );

    const response = await fetch(videoUrl.toString());

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json() as Promise<DailymotionVideo>;
  }

  private async fetchTrackInfoViaYtDlp(
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const info = await this.ytDlpService.getVideoInfo(url);
    const videoId = this.extractVideoId(url);

    return {
      url: videoId ? `https://dai.ly/${videoId}` : url,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      requestedBy,
      provider: this.type,
      isLive: info.duration === 0,
      addedAt: new Date(),
    };
  }

  private extractVideoId(url: string): string | null {
    const match = DAILYMOTION_URL_PATTERN.exec(url);
    return match?.[1] ?? null;
  }

  private extractPlaylistId(url: string): string | null {
    const match = DAILYMOTION_PLAYLIST_PATTERN.exec(url);
    return match?.[1] ?? null;
  }
}
```

### 5. Spotify Provider (Resolver - Unchanged)

Spotify still needs to resolve to YouTube since it doesn't provide stream URLs. The existing implementation is correct.

```typescript
// apps/bot/src/discord/music/providers/spotify.provider.ts
// (No changes from original spec - Spotify API for metadata, YouTube for streaming)
```

See original spec for full Spotify implementation - the API-first approach doesn't change Spotify since it:

1. Uses native Spotify API for metadata (already correct)
2. Resolves to YouTube for streaming (required - Spotify doesn't provide stream URLs)

---

## YtDlpService Extensions

Add these methods to `apps/bot/src/discord/music/yt-dlp.service.ts`:

```typescript
// Add to YtDlpService class

public async getPlaylistTracks(
  url: string,
  requestedBy: string,
  maxTracks: number,
  provider: ProviderType,
): Promise<Track[]> {
  this.ensureReady();

  const args = [
    '--dump-json',
    '--flat-playlist',
    '--no-download',
    '--playlist-end', String(maxTracks),
    ...this.getCookiesArgs(),
    ...this.getExtractorArgs(),
    url,
  ];

  const output = await execYtDlp(this.binaryPath, args);
  const lines = output.trim().split('\n');

  const tracks: Track[] = [];
  for (const line of lines) {
    try {
      const info = JSON.parse(line) as {
        title?: string;
        duration?: number;
        thumbnail?: string;
        thumbnails?: { url: string }[];
        url?: string;
        webpage_url?: string;
      };

      tracks.push({
        url: info.webpage_url ?? info.url ?? '',
        title: info.title ?? 'Unknown Title',
        duration: info.duration ?? 0,
        thumbnail: info.thumbnail ?? info.thumbnails?.[0]?.url ?? '',
        requestedBy,
        provider,
        isLive: info.duration === 0,
        addedAt: new Date(),
      });
    } catch {
      // Skip malformed entries
    }
  }

  return tracks;
}
```

---

## Config Schema Updates

```typescript
// apps/bot/src/config/config.type.ts (additions)

export const configSchema = type.module({
  // ... existing
  json: {
    discord: {
      /* existing */
    },
    'youtube?': {
      /* existing */
    },
    'spotify?': {
      clientId: 'string',
      clientSecret: 'string',
    },
    // Vimeo OAuth is optional - works without it via oEmbed + yt-dlp
    'vimeo?': {
      'clientId?': 'string',
      'clientSecret?': 'string',
      'accessToken?': 'string', // OAuth access token with video_files scope
    },
    // SoundCloud and Dailymotion work without any config
    // (soundcloud.ts handles Client ID automatically)
  },
  // ... rest
});
```

---

## Module Registration

```typescript
// apps/bot/src/discord/music/music.module.ts (update)

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { VoiceModule } from '../voice/voice.module';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { NowPlayingComponents } from './now-playing.components';
import { NowPlayingService } from './now-playing.service';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import { YouTubeProvider } from './providers/youtube.provider';
import { SoundCloudProvider } from './providers/soundcloud.provider';
import { BandcampProvider } from './providers/bandcamp.provider';
import { VimeoProvider } from './providers/vimeo.provider';
import { DailymotionProvider } from './providers/dailymotion.provider';
import { SpotifyProvider } from './providers/spotify.provider';
import { SpotifyService } from './spotify/spotify.service';
import { YtDlpService } from './yt-dlp.service';

@Module({
  imports: [ConfigModule, VoiceModule, DiscoveryModule],
  providers: [
    YtDlpService,
    SpotifyService,
    // Providers (order doesn't matter - discovery sorts by priority)
    YouTubeProvider,
    SoundCloudProvider,
    BandcampProvider,
    VimeoProvider,
    DailymotionProvider,
    SpotifyProvider,
    // Services
    MusicProviderDiscovery,
    MusicService,
    NowPlayingService,
    NowPlayingComponents,
    MusicCommands,
  ],
  exports: [MusicService, NowPlayingService],
})
export class MusicModule {}
```

---

## Dependencies

### Required (Production)

```bash
pnpm add soundcloud.ts bandcamp-fetch spotify-web-api-node
pnpm add -D @types/spotify-web-api-node
```

### Optional (For Enhanced Features)

```bash
# Vimeo OAuth - only if you want direct stream URLs (requires Pro plan)
pnpm add vimeo
pnpm add -D @types/vimeo
```

### Package Summary

| Package                | Version | Purpose                   | Required?     |
| ---------------------- | ------- | ------------------------- | ------------- |
| `soundcloud.ts`        | ^0.6.3  | SoundCloud native API     | Yes           |
| `bandcamp-fetch`       | ^3.0.0  | Bandcamp native API       | Yes           |
| `spotify-web-api-node` | ^5.0.2  | Spotify metadata API      | Yes           |
| `vimeo`                | ^2.1.1  | Vimeo OAuth (stream URLs) | No (optional) |

---

## API Strategy Summary

| Provider        | Metadata Source  | Search Source    | Stream Source                      |
| --------------- | ---------------- | ---------------- | ---------------------------------- |
| **YouTube**     | yt-dlp           | yt-dlp           | yt-dlp                             |
| **SoundCloud**  | `soundcloud.ts`  | `soundcloud.ts`  | `soundcloud.ts` → yt-dlp fallback  |
| **Bandcamp**    | `bandcamp-fetch` | `bandcamp-fetch` | `bandcamp-fetch` → yt-dlp fallback |
| **Vimeo**       | oEmbed API       | Not supported    | yt-dlp (or OAuth if configured)    |
| **Dailymotion** | REST API         | REST API         | yt-dlp                             |
| **Spotify**     | Spotify API      | N/A              | Resolves to YouTube                |

---

## Testing Strategy

### Unit Tests per Provider

```typescript
// apps/bot/src/discord/music/providers/soundcloud.provider.spec.ts

import { TestBed } from '@suites/unit';
import { SoundCloudProvider } from './soundcloud.provider';
import { YtDlpService } from '../yt-dlp.service';

describe('SoundCloudProvider', () => {
  let provider: SoundCloudProvider;
  let ytDlpService: YtDlpService;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SoundCloudProvider).compile();
    provider = unit;
    ytDlpService = unitRef.get(YtDlpService);
  });

  describe('canHandle', () => {
    it('should match soundcloud.com URLs', () => {
      expect(provider.canHandle('https://soundcloud.com/artist/track')).toBe(
        true,
      );
      expect(provider.canHandle('https://snd.sc/artist/track')).toBe(true);
    });

    it('should not match other URLs', () => {
      expect(provider.canHandle('https://youtube.com/watch?v=123')).toBe(false);
      expect(provider.canHandle('https://spotify.com/track/123')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('should try native API first', async () => {
      // Test that native API is attempted before yt-dlp fallback
    });

    it('should fall back to yt-dlp on native API failure', async () => {
      // Mock native API failure, verify yt-dlp is called
    });
  });

  describe('search', () => {
    it('should search via native API', async () => {
      // Test native search
    });
  });
});
```

---

## Checklist

### Files to Create

- [ ] `apps/bot/src/discord/music/providers/provider-types.ts`
- [ ] `apps/bot/src/discord/music/providers/soundcloud.provider.ts`
- [ ] `apps/bot/src/discord/music/providers/soundcloud.provider.spec.ts`
- [ ] `apps/bot/src/discord/music/providers/bandcamp.provider.ts`
- [ ] `apps/bot/src/discord/music/providers/bandcamp.provider.spec.ts`
- [ ] `apps/bot/src/discord/music/providers/vimeo.provider.ts`
- [ ] `apps/bot/src/discord/music/providers/vimeo.provider.spec.ts`
- [ ] `apps/bot/src/discord/music/providers/dailymotion.provider.ts`
- [ ] `apps/bot/src/discord/music/providers/dailymotion.provider.spec.ts`
- [ ] `apps/bot/src/discord/music/spotify/spotify.module.ts`
- [ ] `apps/bot/src/discord/music/spotify/spotify.service.ts`
- [ ] `apps/bot/src/discord/music/spotify/spotify.service.spec.ts`
- [ ] `apps/bot/src/discord/music/providers/spotify.provider.ts`
- [ ] `apps/bot/src/discord/music/providers/spotify.provider.spec.ts`

### Files to Modify

- [ ] `apps/bot/src/discord/music/music-queue.ts` - Extended Track interface
- [ ] `apps/bot/src/discord/music/providers/music-provider.interface.ts` - Extended interface
- [ ] `apps/bot/src/discord/music/providers/youtube.provider.ts` - Add provider type/priority
- [ ] `apps/bot/src/discord/music/yt-dlp.service.ts` - Add playlist support
- [ ] `apps/bot/src/discord/music/music.module.ts` - Register new providers
- [ ] `apps/bot/src/discord/music/music.commands.ts` - Add search command
- [ ] `apps/bot/src/config/config.type.ts` - Add provider configs
- [ ] `apps/bot/config.example.json` - Add example API keys

### Dependencies to Install

```bash
# Required
pnpm add soundcloud.ts bandcamp-fetch spotify-web-api-node
pnpm add -D @types/spotify-web-api-node

# Optional (Vimeo OAuth)
pnpm add vimeo
pnpm add -D @types/vimeo
```
