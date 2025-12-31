import { Injectable, Logger } from '@nestjs/common';
import { AudioPlayerStatus, StreamType } from '@discordjs/voice';
import { AudioFilterService } from './audio-filter.service';
import { VoiceService } from '../voice/voice.service';
import { ZmqVolumeController } from './zmq-volume-controller.service';
import { LoopMode, MusicQueue, type Track } from './music-queue';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import type { MusicProvider } from './providers/music-provider.interface';

const ZMQ_CONNECT_DELAY_MS = 500;

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private readonly queues = new Map<string, MusicQueue>();

  public constructor(
    private readonly audioFilterService: AudioFilterService,
    private readonly voiceService: VoiceService,
    private readonly volumeController: ZmqVolumeController,
    private readonly providerDiscovery: MusicProviderDiscovery,
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

  private getProviderForUrl(url: string): MusicProvider {
    const provider = this.providers.find((p) => p.canHandle(url));
    if (!provider) {
      throw new Error(`No provider found for URL: ${url}`);
    }
    return provider;
  }

  private async playTrack(guildId: string, track: Track): Promise<void> {
    const provider = this.getProviderForUrl(track.url);
    const audioUrl = await provider.getAudioUrl(track.url);

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

  private getOrCreateQueue(guildId: string): MusicQueue {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new MusicQueue();
      this.queues.set(guildId, queue);
    }
    return queue;
  }
}
