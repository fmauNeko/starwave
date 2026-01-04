import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type SendableChannels,
  type TextChannel,
} from 'discord.js';
import type { Config } from '../../config/config.type';
import { LoopMode } from './music-queue';
import { MusicService } from './music.service';

export const NOW_PLAYING_BUTTON_IDS = {
  PLAY_PAUSE: 'np_playpause',
  SKIP: 'np_skip',
  STOP: 'np_stop',
  SHUFFLE: 'np_shuffle',
  LOOP: 'np_loop',
} as const;

const DEFAULT_ACCENT_COLOR = 0x5865f2;

@Injectable()
export class NowPlayingService {
  public static readonly BUTTON_IDS = NOW_PLAYING_BUTTON_IDS;

  private readonly guildChannels = new Map<string, string>();
  private readonly guildMessages = new Map<string, string>();

  public constructor(
    private readonly musicService: MusicService,
    private readonly configService: ConfigService<Config, true>,
    private readonly client: Client,
  ) {}

  public setChannelForGuild(guildId: string, channelId: string): void {
    this.guildChannels.set(guildId, channelId);
  }

  public getChannelForGuild(guildId: string): string | undefined {
    return this.guildChannels.get(guildId);
  }

  public getMessageForGuild(guildId: string): string | undefined {
    return this.guildMessages.get(guildId);
  }

  public async sendNowPlaying(guildId: string): Promise<void> {
    const channelId = this.guildChannels.get(guildId);
    if (!channelId) {
      return;
    }

    const track = this.musicService.getNowPlaying(guildId);
    if (!track) {
      return;
    }

    await this.deleteExistingMessage(guildId, channelId);

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !this.isSendableChannel(channel)) {
      return;
    }

    const components = this.buildNowPlayingComponents(guildId);
    const message = await channel.send({
      components,
      flags: [MessageFlags.IsComponentsV2],
    });

    this.guildMessages.set(guildId, message.id);
  }

  public async deleteNowPlaying(guildId: string): Promise<void> {
    const channelId = this.guildChannels.get(guildId);
    const messageId = this.guildMessages.get(guildId);

    if (!channelId || !messageId) {
      return;
    }

    await this.deleteExistingMessage(guildId, channelId);
  }

  public async repostIfInSameChannel(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    const storedChannelId = this.guildChannels.get(guildId);
    const messageId = this.guildMessages.get(guildId);

    if (storedChannelId !== channelId || !messageId) {
      return;
    }

    await this.sendNowPlaying(guildId);
  }

  public async cleanup(guildId: string): Promise<void> {
    const channelId = this.guildChannels.get(guildId);
    if (channelId) {
      await this.deleteExistingMessage(guildId, channelId);
    }

    this.guildChannels.delete(guildId);
    this.guildMessages.delete(guildId);
  }

  private buildNowPlayingComponents(guildId: string): ContainerBuilder[] {
    const track = this.musicService.getNowPlaying(guildId);
    if (!track) {
      return [];
    }

    const isPlaying = this.musicService.isPlaying(guildId);
    const isPaused = this.musicService.isPaused(guildId);
    const loopMode = this.musicService.getLoopMode(guildId);
    const volume = this.musicService.getVolume(guildId);
    const upcoming = this.musicService.getUpcoming(guildId);

    const guildsSettings = this.configService.get('discord.guildsSettings', {
      infer: true,
    });
    const guildSettings = guildsSettings[guildId];
    const accentColor = this.parseAccentColor(guildSettings?.theme.accentColor);

    const statusParts: string[] = [];
    if (isPaused) {
      statusParts.push('⏸️ Paused');
    } else if (isPlaying) {
      statusParts.push('▶️ Playing');
    }

    statusParts.push(`🔊 ${String(Math.round(volume * 100))}%`);

    if (loopMode === LoopMode.Track) {
      statusParts.push('🔂 Loop Track');
    } else if (loopMode === LoopMode.Queue) {
      statusParts.push('🔁 Loop Queue');
    }

    if (upcoming.length > 0) {
      statusParts.push(`📋 ${String(upcoming.length)} in queue`);
    }

    const durationFormatted = this.formatDuration(track.duration);

    const container = new ContainerBuilder()
      .setAccentColor(accentColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 🎵 Now Playing\n**${track.title}**\n${durationFormatted} • Requested by ${track.requestedBy}\n\n${statusParts.join(' • ')}`,
        ),
      )
      .addActionRowComponents(this.buildActionRow(isPaused, loopMode));

    return [container];
  }

  private buildActionRow(
    isPaused: boolean,
    loopMode: LoopMode,
  ): ActionRowBuilder<ButtonBuilder> {
    const playPauseButton = new ButtonBuilder()
      .setCustomId(NOW_PLAYING_BUTTON_IDS.PLAY_PAUSE)
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Secondary);

    const skipButton = new ButtonBuilder()
      .setCustomId(NOW_PLAYING_BUTTON_IDS.SKIP)
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary);

    const stopButton = new ButtonBuilder()
      .setCustomId(NOW_PLAYING_BUTTON_IDS.STOP)
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger);

    const shuffleButton = new ButtonBuilder()
      .setCustomId(NOW_PLAYING_BUTTON_IDS.SHUFFLE)
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary);

    const loopButton = new ButtonBuilder()
      .setCustomId(NOW_PLAYING_BUTTON_IDS.LOOP)
      .setEmoji(this.getLoopEmoji(loopMode))
      .setStyle(
        loopMode !== LoopMode.None
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary,
      );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      playPauseButton,
      skipButton,
      stopButton,
      shuffleButton,
      loopButton,
    );
  }

  private getLoopEmoji(loopMode: LoopMode): string {
    switch (loopMode) {
      case LoopMode.Track:
        return '🔂';
      case LoopMode.Queue:
        return '🔁';
      default:
        return '➡️';
    }
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${String(hours)}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${String(minutes)}:${secs.toString().padStart(2, '0')}`;
  }

  private parseAccentColor(colorString?: string): number {
    if (!colorString) {
      return DEFAULT_ACCENT_COLOR;
    }
    const hex = colorString.replace('#', '');
    return parseInt(hex, 16);
  }

  private isSendableChannel(channel: unknown): channel is SendableChannels {
    return (
      channel !== null &&
      typeof channel === 'object' &&
      'send' in channel &&
      typeof (channel as { send: unknown }).send === 'function' &&
      'isSendable' in channel &&
      typeof (channel as { isSendable: unknown }).isSendable === 'function' &&
      (channel as { isSendable: () => boolean }).isSendable()
    );
  }

  private async deleteExistingMessage(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    const messageId = this.guildMessages.get(guildId);
    if (!messageId) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && 'messages' in channel) {
        const textChannel = channel as TextChannel;
        const message = await textChannel.messages.fetch(messageId);
        await message.delete();
      }
    } catch {
      // Empty catch: message may already be deleted by user or Discord
    }

    this.guildMessages.delete(guildId);
  }
}
