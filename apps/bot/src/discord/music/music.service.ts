import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AudioPlayerStatus, StreamType } from '@discordjs/voice';
import { VoiceService } from '../voice/voice.service';
import { LoopMode, MusicQueue, type Track } from './music-queue';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import type {
  AudioInfo,
  MusicProvider,
} from './providers/music-provider.interface';

export const MUSIC_EVENTS = {
  QUEUE_END: 'music.queue.end',
  TRACK_START: 'music.track.start',
} as const;

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private readonly queues = new Map<string, MusicQueue>();
  private readonly autoPlaySetup = new Set<string>();
  private readonly handlingTrackEnd = new Set<string>();

  public constructor(
    private readonly voiceService: VoiceService,
    private readonly providerDiscovery: MusicProviderDiscovery,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private get providers(): MusicProvider[] {
    return this.providerDiscovery.getProviders();
  }

  public async play(
    guildId: string,
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const provider = this.getProviderForUrl(url);
    const track = await provider.fetchTrackInfo(url, requestedBy);
    const queue = this.getOrCreateQueue(guildId);

    const shouldStartPlayback = queue.isEmpty();
    queue.add(track);

    if (shouldStartPlayback) {
      await this.playTrack(guildId, track);
    }

    return track;
  }

  public async searchAndPlay(
    guildId: string,
    query: string,
    requestedBy: string,
  ): Promise<Track> {
    const provider = this.providers[0];
    if (!provider) {
      throw new Error('No search provider available');
    }

    const track = await provider.search(query, requestedBy);
    const queue = this.getOrCreateQueue(guildId);

    const shouldStartPlayback = queue.isEmpty();
    queue.add(track);

    if (shouldStartPlayback) {
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

  public setVolume(guildId: string, volume: number): number {
    if (!this.isPlaying(guildId) && !this.isPaused(guildId)) {
      throw new Error('No active playback to adjust volume');
    }
    return this.voiceService.setVolume(guildId, volume);
  }

  public getVolume(guildId: string): number {
    return this.voiceService.getVolume(guildId);
  }

  public cleanup(guildId: string): void {
    this.voiceService.stop(guildId);
    this.autoPlaySetup.delete(guildId);
    this.handlingTrackEnd.delete(guildId);
    this.queues.delete(guildId);
  }

  public setupAutoPlay(guildId: string): void {
    if (this.autoPlaySetup.has(guildId)) {
      return;
    }

    const player = this.voiceService.getPlayer(guildId);
    if (!player) {
      return;
    }

    player.on(AudioPlayerStatus.Idle, () => {
      void this.handleTrackEnd(guildId);
    });

    this.autoPlaySetup.add(guildId);
  }

  private async handleTrackEnd(guildId: string): Promise<void> {
    if (this.handlingTrackEnd.has(guildId)) {
      return;
    }

    this.handlingTrackEnd.add(guildId);

    try {
      const queue = this.queues.get(guildId);
      if (!queue) {
        return;
      }

      const nextTrack = queue.getNext();

      if (nextTrack) {
        try {
          await this.playTrack(guildId, nextTrack);
        } catch (error) {
          this.logger.error(`Auto-play failed for guild ${guildId}`, error);
        }
      } else {
        queue.clear();
        this.eventEmitter.emit(MUSIC_EVENTS.QUEUE_END, guildId);
      }
    } finally {
      this.handlingTrackEnd.delete(guildId);
    }
  }

  private getProviderForUrl(url: string): MusicProvider {
    const provider = this.providers.find((p) => p.canHandle(url));
    if (!provider) {
      throw new Error(`No provider found for URL: ${url}`);
    }
    return provider;
  }

  private async playTrack(guildId: string, track: Track): Promise<void> {
    try {
      const provider = this.getProviderForUrl(track.url);
      const audioInfo = await provider.getAudioInfo(track.url);
      const streamType = this.getStreamTypeForCodec(audioInfo);

      this.voiceService.play(guildId, audioInfo.url, {
        inputType: streamType,
      });

      this.eventEmitter.emit(MUSIC_EVENTS.TRACK_START, guildId);

      this.logger.log(
        `Now playing: ${track.title} in guild ${guildId} (codec: ${audioInfo.codec}, container: ${audioInfo.container})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to play track "${track.title}" in guild ${guildId}`,
        error,
      );
      throw error;
    }
  }

  private getStreamTypeForCodec(audioInfo: AudioInfo): StreamType {
    if (audioInfo.codec === 'opus') {
      if (audioInfo.container === 'webm') {
        return StreamType.WebmOpus;
      }
      if (audioInfo.container === 'ogg') {
        return StreamType.OggOpus;
      }
    }
    return StreamType.Arbitrary;
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
