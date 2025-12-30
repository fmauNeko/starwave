import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AudioPlayerStatus, StreamType } from '@discordjs/voice';
import { ClientType, Innertube, UniversalCache } from 'youtubei.js';
import { Readable } from 'node:stream';
import { VoiceService } from '../voice/voice.service';
import { LoopMode, MusicQueue, type Track } from './music-queue';

@Injectable()
export class MusicService implements OnModuleInit {
  private readonly logger = new Logger(MusicService.name);
  private readonly queues = new Map<string, MusicQueue>();
  private innertube!: Innertube;

  public constructor(private readonly voiceService: VoiceService) {}

  public async onModuleInit(): Promise<void> {
    this.innertube = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      client_type: ClientType.ANDROID,
    });
    this.logger.log('YouTube.js client initialized');
  }

  public async play(
    guildId: string,
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const track = await this.fetchTrackInfo(url, requestedBy);
    const queue = this.getOrCreateQueue(guildId);

    queue.add(track);

    if (queue.size() === 1) {
      await this.playTrack(guildId, track);
    }

    return track;
  }

  public skip(guildId: string): Track | undefined {
    const queue = this.queues.get(guildId);
    if (!queue) {
      return undefined;
    }

    const nextTrack = queue.skip();
    if (nextTrack) {
      void this.playTrack(guildId, nextTrack);
    } else {
      this.voiceService.stop(guildId);
    }

    return nextTrack;
  }

  public stop(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (!queue) {
      return false;
    }

    queue.clear();
    this.voiceService.stop(guildId);
    return true;
  }

  public pause(guildId: string): boolean {
    return this.voiceService.pause(guildId);
  }

  public resume(guildId: string): boolean {
    return this.voiceService.unpause(guildId);
  }

  public getNowPlaying(guildId: string): Track | undefined {
    return this.queues.get(guildId)?.getCurrent();
  }

  public getQueue(guildId: string): Track[] {
    return this.queues.get(guildId)?.getAll() ?? [];
  }

  public getUpcoming(guildId: string): Track[] {
    return this.queues.get(guildId)?.getUpcoming() ?? [];
  }

  public clearQueue(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (!queue) {
      return false;
    }

    const current = queue.getCurrent();
    queue.clear();
    if (current) {
      queue.add(current);
    }
    return true;
  }

  public shuffle(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (!queue || queue.size() <= 1) {
      return false;
    }

    queue.shuffle();
    return true;
  }

  public cycleLoopMode(guildId: string): LoopMode {
    const queue = this.getOrCreateQueue(guildId);
    return queue.cycleLoopMode();
  }

  public getLoopMode(guildId: string): LoopMode {
    return this.queues.get(guildId)?.getLoopMode() ?? LoopMode.None;
  }

  public remove(guildId: string, index: number): Track | undefined {
    const queue = this.queues.get(guildId);
    if (!queue) {
      return undefined;
    }

    const currentIndex = queue.getCurrentIndex();
    if (index === currentIndex) {
      return undefined;
    }

    return queue.remove(index);
  }

  public isPlaying(guildId: string): boolean {
    const status = this.voiceService.getPlayerStatus(guildId);
    return status === AudioPlayerStatus.Playing;
  }

  public isPaused(guildId: string): boolean {
    const status = this.voiceService.getPlayerStatus(guildId);
    return status === AudioPlayerStatus.Paused;
  }

  public cleanup(guildId: string): void {
    this.queues.delete(guildId);
  }

  public setupAutoPlay(guildId: string): void {
    const player = this.voiceService.getPlayer(guildId);
    if (!player) {
      return;
    }

    player.on(AudioPlayerStatus.Idle, () => {
      const queue = this.queues.get(guildId);
      if (!queue) {
        return;
      }

      const nextTrack = queue.getNext();
      if (nextTrack) {
        void this.playTrack(guildId, nextTrack);
      }
    });
  }

  private async fetchTrackInfo(
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

  private async playTrack(guildId: string, track: Track): Promise<void> {
    const { stream, streamType } = await this.getAudioStream(track.url);
    this.voiceService.play(guildId, stream, {
      inputType: streamType,
    });
    this.logger.log(`Now playing: ${track.title} in guild ${guildId}`);
  }

  private async getAudioStream(
    url: string,
  ): Promise<{ stream: Readable; streamType: StreamType }> {
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

    const isWebmOpus =
      selectedFormat.mime_type.includes('audio/webm') &&
      selectedFormat.mime_type.includes('opus');

    const response = await fetch(selectedFormat.url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch audio stream: ${String(response.status)}`,
      );
    }

    if (!response.body) {
      throw new Error('No response body available');
    }

    return {
      stream: Readable.fromWeb(
        response.body as Parameters<typeof Readable.fromWeb>[0],
      ),
      streamType: isWebmOpus ? StreamType.WebmOpus : StreamType.Arbitrary,
    };
  }

  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  private getOrCreateQueue(guildId: string): MusicQueue {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new MusicQueue();
      this.queues.set(guildId, queue);
    }
    return queue;
  }
}
