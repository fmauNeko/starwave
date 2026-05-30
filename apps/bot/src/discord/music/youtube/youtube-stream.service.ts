import { Injectable, Logger } from '@nestjs/common';
import { StreamType } from '@discordjs/voice';
import { Constants } from 'youtubei.js';
import { SabrStream } from 'googlevideo/sabr-stream';
import { buildSabrFormat, EnabledTrackTypes } from 'googlevideo/utils';
import { Readable } from 'node:stream';
import { regex } from 'arkregex';
import { InnertubeSessionService } from './innertube-session.service';

const YOUTUBE_URL_PATTERN = regex(
  '(?:youtube\\.com/(?:watch\\?v=|embed/|shorts/)|youtu\\.be/)([a-zA-Z0-9_-]{11})',
);
const VIDEO_ID_PATTERN = regex('^([a-zA-Z0-9_-]{11})$');

interface ThumbnailLike {
  url?: string;
}

interface VideoInfoLike {
  basic_info?: {
    title?: string;
    duration?: number;
    thumbnail?: ThumbnailLike[];
    is_live?: boolean;
  };
  videoDetails?: {
    title?: string;
    lengthSeconds?: string;
    thumbnail?: {
      thumbnails?: ThumbnailLike[];
    };
    isLive?: boolean;
  };
  streaming_data?: {
    adaptive_formats?: unknown[];
    server_abr_streaming_url?: string;
  };
  player_config?: {
    media_common_config?: {
      media_ustreamer_request_config?: {
        video_playback_ustreamer_config?: string;
      };
    };
  };
}

interface SearchResultLike {
  video_id?: string;
  id?: string;
  title?: string | { toString: () => string };
  duration?: {
    seconds?: number;
  };
  thumbnails?: ThumbnailLike[];
  thumbnail?: {
    thumbnails?: ThumbnailLike[];
  };
  best_thumbnail?: ThumbnailLike;
}

interface SearchResultsLike {
  videos?: SearchResultLike[];
  results?: SearchResultLike[];
}

export interface VideoMetadata {
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
}

@Injectable()
export class YouTubeStreamService {
  private readonly logger = new Logger(YouTubeStreamService.name);

  public constructor(private readonly session: InnertubeSessionService) {}

  public async getMetadata(videoIdOrUrl: string): Promise<VideoMetadata> {
    const videoId = this.extractVideoId(videoIdOrUrl);
    this.logger.debug(`youtube.metadata.fetch: ${videoId}`);

    const client = this.getClient();
    const poToken = await this.session.generateContentPoToken(videoId);
    const info = await client.getInfo(videoId, { po_token: poToken });

    return this.metadataFromInfo(videoId, info as VideoInfoLike);
  }

  public async search(query: string): Promise<VideoMetadata> {
    this.logger.debug(`youtube.search: ${query}`);

    const client = this.getClient();
    const searchResults = (await client.search(query)) as SearchResultsLike;
    const firstResult = searchResults.videos?.[0] ?? searchResults.results?.[0];

    if (!firstResult) {
      throw new Error('No search results found');
    }

    const videoId = firstResult.video_id ?? firstResult.id;
    if (!videoId) {
      throw new Error('No search results found');
    }

    return {
      title: this.getSearchTitle(firstResult),
      duration: firstResult.duration?.seconds ?? 0,
      thumbnail: this.getSearchThumbnail(firstResult),
      url: this.canonicalUrl(videoId),
    };
  }

  public async getAudioStream(
    videoIdOrUrl: string,
  ): Promise<{ source: Readable; streamType: StreamType }> {
    const videoId = this.extractVideoId(videoIdOrUrl);
    let attempt = 0;

    while (attempt <= 1) {
      try {
        return await this.acquireStream(videoId);
      } catch (error: unknown) {
        if (attempt === 0 && this.isTokenError(error)) {
          this.logger.warn(
            `youtube.stream.error: token failure, refreshing session for ${videoId}`,
          );
          await this.session.refresh('token failure on stream acquisition');
          attempt++;
          continue;
        }

        this.logger.error(
          `youtube.stream.error: ${videoId}`,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }

    throw new Error('Unexpected YouTube stream acquisition state');
  }

  private async acquireStream(
    videoId: string,
  ): Promise<{ source: Readable; streamType: StreamType }> {
    const startedAt = Date.now();
    this.logger.debug(`youtube.stream.acquire: ${videoId}`);

    const client = this.getClient();
    const poToken = await this.session.generateContentPoToken(videoId);
    const info = (await client.getInfo(videoId, {
      po_token: poToken,
    })) as VideoInfoLike;

    if (this.isLiveInfo(info)) {
      throw new Error(`Cannot stream live content: ${videoId}`);
    }

    const streamingData = info.streaming_data;
    if (!streamingData?.server_abr_streaming_url) {
      throw new Error('No SABR streaming URL available');
    }

    const videoPlaybackUstreamerConfig =
      info.player_config?.media_common_config?.media_ustreamer_request_config
        ?.video_playback_ustreamer_config;
    if (!videoPlaybackUstreamerConfig) {
      throw new Error('No SABR ustreamer config available');
    }

    const sabrStream = new SabrStream({
      formats:
        streamingData.adaptive_formats?.map((format) =>
          buildSabrFormat(format as Parameters<typeof buildSabrFormat>[0]),
        ) ?? [],
      serverAbrStreamingUrl: streamingData.server_abr_streaming_url,
      videoPlaybackUstreamerConfig,
      poToken,
      clientInfo: this.getSabrClientInfo(client),
    });

    const { audioStream } = await sabrStream.start({
      enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
      preferOpus: true,
    });
    const nodeStream = Readable.fromWeb(
      audioStream as Parameters<typeof Readable.fromWeb>[0],
    );

    this.logger.log(
      `youtube.stream.acquired: ${videoId} [${String(Date.now() - startedAt)}ms]`,
    );

    return { source: nodeStream, streamType: StreamType.WebmOpus };
  }

  private getClient(): NonNullable<
    ReturnType<InnertubeSessionService['getClient']>
  > {
    const client = this.session.getClient();

    if (!client) {
      throw new Error('Innertube session not ready');
    }

    return client;
  }

  private metadataFromInfo(
    videoId: string,
    info: VideoInfoLike,
  ): VideoMetadata {
    const basicInfo = info.basic_info;
    const legacyDetails = info.videoDetails;

    if (!basicInfo && !legacyDetails) {
      throw new Error('No video metadata found');
    }

    if (this.isLiveInfo(info)) {
      throw new Error('Live streams are not supported');
    }

    return {
      title: basicInfo?.title ?? legacyDetails?.title ?? 'Unknown Title',
      duration:
        basicInfo?.duration ?? this.parseSeconds(legacyDetails?.lengthSeconds),
      thumbnail:
        basicInfo?.thumbnail?.[0]?.url ??
        legacyDetails?.thumbnail?.thumbnails?.[0]?.url ??
        '',
      url: this.canonicalUrl(videoId),
    };
  }

  private getSabrClientInfo(
    client: NonNullable<ReturnType<InnertubeSessionService['getClient']>>,
  ): { clientName: number; clientVersion: string } {
    const innertubeClient = client.session.context.client;
    const clientNameIds = Constants.CLIENT_NAME_IDS as unknown as Record<
      string,
      string
    >;
    const clientName = Number(
      clientNameIds[innertubeClient.clientName] ?? innertubeClient.clientName,
    );

    if (!Number.isFinite(clientName)) {
      throw new Error(
        `Unsupported Innertube client: ${innertubeClient.clientName}`,
      );
    }

    return {
      clientName,
      clientVersion: innertubeClient.clientVersion,
    };
  }

  private isLiveInfo(info: VideoInfoLike): boolean {
    return (
      info.basic_info?.is_live === true || info.videoDetails?.isLive === true
    );
  }

  private getSearchTitle(result: SearchResultLike): string {
    if (typeof result.title === 'string') {
      return result.title;
    }

    const renderedTitle = result.title?.toString();
    if (renderedTitle && renderedTitle !== '[object Object]') {
      return renderedTitle;
    }

    return 'Unknown Title';
  }

  private getSearchThumbnail(result: SearchResultLike): string {
    return (
      result.thumbnails?.[0]?.url ??
      result.thumbnail?.thumbnails?.[0]?.url ??
      result.best_thumbnail?.url ??
      ''
    );
  }

  private parseSeconds(value: string | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isTokenError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('403') ||
      message.includes('login_required') ||
      message.includes('unauthorized')
    );
  }

  private extractVideoId(videoIdOrUrl: string): string {
    const urlMatch = YOUTUBE_URL_PATTERN.exec(videoIdOrUrl);
    if (urlMatch?.[1]) {
      return urlMatch[1];
    }

    const idMatch = VIDEO_ID_PATTERN.exec(videoIdOrUrl);
    if (idMatch?.[1]) {
      return idMatch[1];
    }

    throw new Error('Invalid YouTube URL');
  }

  private canonicalUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
}
