import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AudioPlayerStatus, StreamType } from '@discordjs/voice';
import { ClientType, Innertube, UniversalCache } from 'youtubei.js';
import { AudioFilterService } from './audio-filter.service';
import { VoiceService } from '../voice/voice.service';
import { ZmqVolumeController } from './zmq-volume-controller.service';
import { LoopMode, MusicQueue, type Track } from './music-queue';

const ZMQ_CONNECT_DELAY_MS = 500;

@Injectable()
export class MusicService implements OnModuleInit {
  private readonly logger = new Logger(MusicService.name);
  private readonly queues = new Map<string, MusicQueue>();
  private innertube!: Innertube;

  public constructor(
    private readonly audioFilterService: AudioFilterService,
    private readonly voiceService: VoiceService,
    private readonly volumeController: ZmqVolumeController,
  ) {}

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

  public async setVolume(guildId: string, volume: number): Promise<number> {
    if (!this.volumeController.isConnected(guildId)) {
      throw new Error('No active playback to adjust volume');
    }
    return this.volumeController.setVolume(guildId, volume);
  }

  public getVolume(guildId: string): number {
    return this.volumeController.getVolume(guildId);
  }

  public cleanup(guildId: string): void {
    this.queues.delete(guildId);
    this.volumeController.cleanup(guildId);
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
    const audioUrl = await this.getAudioUrl(track.url);

    this.volumeController.allocatePort(guildId);
    const zmqBindAddress = this.volumeController.getBindAddress(guildId);
    const currentVolume = this.volumeController.getVolume(guildId);

    const filteredStream = this.audioFilterService.createFilteredStream(
      audioUrl,
      {
        volume: currentVolume,
        zmqBindAddress,
      },
    );

    this.voiceService.play(guildId, filteredStream, {
      inputType: StreamType.OggOpus,
    });

    setTimeout(() => {
      try {
        this.volumeController.connect(guildId);
      } catch (error: unknown) {
        this.logger.warn(`Failed to connect ZMQ for guild ${guildId}:`, error);
      }
    }, ZMQ_CONNECT_DELAY_MS);

    this.logger.log(`Now playing: ${track.title} in guild ${guildId}`);
  }

  private async getAudioUrl(url: string): Promise<string> {
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

    return selectedFormat.url;
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
