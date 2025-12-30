import { Injectable, Logger } from '@nestjs/common';
import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import type { Readable } from 'node:stream';

export interface PlayOptions {
  inputType?: StreamType;
  inlineVolume?: boolean;
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly players = new Map<string, AudioPlayer>();

  public async join(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    const guild = channel.guild;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    this.setupConnectionHandlers(connection, guild.id);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      this.logger.log(
        `Joined voice channel "${channel.name}" in guild "${guild.name}"`,
      );
      return connection;
    } catch {
      connection.destroy();
      throw new Error(
        `Failed to join voice channel "${channel.name}" within 30 seconds`,
      );
    }
  }

  public leave(guildId: string): boolean {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      return false;
    }

    this.cleanupPlayer(guildId);
    connection.destroy();
    this.logger.log(`Left voice channel in guild ${guildId}`);
    return true;
  }

  public isConnected(guildId: string): boolean {
    return !!getVoiceConnection(guildId);
  }

  public play(
    guildId: string,
    stream: Readable | string,
    options: PlayOptions = {},
  ): AudioResource {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      throw new Error(`Not connected to voice in guild ${guildId}`);
    }

    const player = this.getOrCreatePlayer(guildId);
    connection.subscribe(player);

    const resource = createAudioResource(stream, {
      ...(options.inputType !== undefined && { inputType: options.inputType }),
      ...(options.inlineVolume !== undefined && {
        inlineVolume: options.inlineVolume,
      }),
    });

    player.play(resource);
    this.logger.log(`Started playing audio in guild ${guildId}`);

    return resource;
  }

  public stop(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) {
      return false;
    }

    player.stop();
    this.logger.log(`Stopped audio in guild ${guildId}`);
    return true;
  }

  public pause(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) {
      return false;
    }

    const paused = player.pause();
    if (paused) {
      this.logger.log(`Paused audio in guild ${guildId}`);
    }
    return paused;
  }

  public unpause(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) {
      return false;
    }

    const unpaused = player.unpause();
    if (unpaused) {
      this.logger.log(`Unpaused audio in guild ${guildId}`);
    }
    return unpaused;
  }

  public getPlayer(guildId: string): AudioPlayer | undefined {
    return this.players.get(guildId);
  }

  public getPlayerStatus(guildId: string): AudioPlayerStatus | undefined {
    return this.players.get(guildId)?.state.status;
  }

  private getOrCreatePlayer(guildId: string): AudioPlayer {
    let player = this.players.get(guildId);
    if (player) {
      return player;
    }

    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    this.setupPlayerHandlers(player, guildId);
    this.players.set(guildId, player);

    return player;
  }

  private setupPlayerHandlers(player: AudioPlayer, guildId: string): void {
    player.on('error', (error) => {
      this.logger.error(`Audio player error in guild ${guildId}:`, error);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      this.logger.log(`Audio finished in guild ${guildId}`);
    });
  }

  private cleanupPlayer(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
      this.players.delete(guildId);
    }
  }

  private setupConnectionHandlers(
    connection: VoiceConnection,
    guildId: string,
  ): void {
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void this.handleDisconnect(connection, guildId);
    });

    connection.on('error', (error) => {
      this.logger.error(`Voice connection error in guild ${guildId}:`, error);
    });
  }

  private async handleDisconnect(
    connection: VoiceConnection,
    guildId: string,
  ): Promise<void> {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      this.cleanupPlayer(guildId);
      connection.destroy();
      this.logger.log(`Disconnected from voice in guild ${guildId}`);
    }
  }
}
