import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { getVoiceConnection } from '@discordjs/voice';
import type { Client, VoiceBasedChannel, VoiceState } from 'discord.js';
import { Context, type ContextOf, On, Once } from 'necord';
import { VoiceService } from './voice.service';

const INACTIVITY_TIMEOUT_MS = 30_000;

@Injectable()
export class VoiceInactivityService implements OnModuleDestroy {
  private readonly logger = new Logger(VoiceInactivityService.name);
  private readonly inactivityTimers = new Map<string, NodeJS.Timeout>();
  private client: Client | undefined;

  public constructor(private readonly voiceService: VoiceService) {}

  public onModuleDestroy(): void {
    this.clearAllTimers();
  }

  @Once('clientReady')
  public onClientReady(@Context() [client]: ContextOf<'ready'>): void {
    this.client = client;
  }

  @On('voiceStateUpdate')
  public onVoiceStateUpdate(
    @Context() [oldState, newState]: ContextOf<'voiceStateUpdate'>,
  ): void {
    this.handleVoiceStateChange(oldState, newState);
  }

  private handleVoiceStateChange(
    oldState: VoiceState,
    newState: VoiceState,
  ): void {
    const guildId = oldState.guild.id;

    if (!this.voiceService.isConnected(guildId)) {
      return;
    }

    const botChannel = this.getBotVoiceChannel(guildId);
    if (!botChannel) {
      return;
    }

    const userLeftBotChannel =
      oldState.channelId === botChannel.id &&
      newState.channelId !== botChannel.id;
    const userJoinedBotChannel =
      newState.channelId === botChannel.id &&
      oldState.channelId !== botChannel.id;

    if (userLeftBotChannel) {
      this.checkChannelAndScheduleLeave(guildId, botChannel);
    } else if (userJoinedBotChannel) {
      this.cancelScheduledLeave(guildId);
    }
  }

  private getBotVoiceChannel(guildId: string): VoiceBasedChannel | undefined {
    if (!this.client) {
      return undefined;
    }

    const connection = getVoiceConnection(guildId);
    if (!connection) {
      return undefined;
    }

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      return undefined;
    }

    const botMember = guild.members.me;
    return botMember?.voice.channel ?? undefined;
  }

  private checkChannelAndScheduleLeave(
    guildId: string,
    channel: VoiceBasedChannel,
  ): void {
    if (this.isChannelEmpty(channel)) {
      this.scheduleLeave(guildId);
    }
  }

  private isChannelEmpty(channel: VoiceBasedChannel): boolean {
    const nonBotMembers = channel.members.filter((member) => !member.user.bot);
    return nonBotMembers.size === 0;
  }

  private scheduleLeave(guildId: string): void {
    if (this.inactivityTimers.has(guildId)) {
      return;
    }

    this.logger.log(
      `Scheduling auto-leave for guild ${guildId} in ${String(INACTIVITY_TIMEOUT_MS / 1000)} seconds`,
    );

    const timer = setTimeout(() => {
      this.executeLeave(guildId);
    }, INACTIVITY_TIMEOUT_MS);

    this.inactivityTimers.set(guildId, timer);
  }

  private cancelScheduledLeave(guildId: string): void {
    const timer = this.inactivityTimers.get(guildId);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(guildId);
      this.logger.log(`Cancelled auto-leave for guild ${guildId}`);
    }
  }

  private executeLeave(guildId: string): void {
    this.inactivityTimers.delete(guildId);

    const botChannel = this.getBotVoiceChannel(guildId);
    if (botChannel && !this.isChannelEmpty(botChannel)) {
      this.logger.log(
        `Skipping auto-leave for guild ${guildId}: channel no longer empty`,
      );
      return;
    }

    if (this.voiceService.leave(guildId)) {
      this.logger.log(
        `Auto-left voice channel in guild ${guildId} due to inactivity`,
      );
    }
  }

  private clearAllTimers(): void {
    for (const timer of this.inactivityTimers.values()) {
      clearTimeout(timer);
    }
    this.inactivityTimers.clear();
  }

  public cancelTimer(guildId: string): void {
    this.cancelScheduledLeave(guildId);
  }
}
