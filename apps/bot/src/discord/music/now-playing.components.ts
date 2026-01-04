import { Injectable } from '@nestjs/common';
import { MessageFlags } from 'discord.js';
import { Button, type ButtonContext, Ctx } from 'necord';
import { MusicService } from './music.service';
import {
  NOW_PLAYING_BUTTON_IDS,
  NowPlayingService,
} from './now-playing.service';

@Injectable()
export class NowPlayingComponents {
  public constructor(
    private readonly musicService: MusicService,
    private readonly nowPlayingService: NowPlayingService,
  ) {}

  @Button(NOW_PLAYING_BUTTON_IDS.PLAY_PAUSE)
  public async onPlayPauseButton(@Ctx() [interaction]: ButtonContext) {
    if (!interaction.inGuild()) {
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member?.voice.channel) {
      return;
    }

    await interaction.deferUpdate();

    const guildId = interaction.guildId;

    if (this.musicService.isPlaying(guildId)) {
      this.musicService.pause(guildId);
    } else if (this.musicService.isPaused(guildId)) {
      this.musicService.resume(guildId);
    }

    await this.nowPlayingService.sendNowPlaying(guildId);
  }

  @Button(NOW_PLAYING_BUTTON_IDS.SKIP)
  public async onSkipButton(@Ctx() [interaction]: ButtonContext) {
    if (!interaction.inGuild()) {
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member?.voice.channel) {
      return;
    }

    await interaction.deferUpdate();

    const guildId = interaction.guildId;
    const nextTrack = this.musicService.skip(guildId);

    if (nextTrack) {
      await this.nowPlayingService.sendNowPlaying(guildId);
    } else {
      await this.nowPlayingService.deleteNowPlaying(guildId);
    }
  }

  @Button(NOW_PLAYING_BUTTON_IDS.STOP)
  public async onStopButton(@Ctx() [interaction]: ButtonContext) {
    if (!interaction.inGuild()) {
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member?.voice.channel) {
      return;
    }

    await interaction.deferUpdate();

    const guildId = interaction.guildId;
    this.musicService.stop(guildId);
    await this.nowPlayingService.deleteNowPlaying(guildId);
  }

  @Button(NOW_PLAYING_BUTTON_IDS.SHUFFLE)
  public async onShuffleButton(@Ctx() [interaction]: ButtonContext) {
    if (!interaction.inGuild()) {
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member?.voice.channel) {
      return;
    }

    await interaction.deferUpdate();

    const guildId = interaction.guildId;
    const shuffled = this.musicService.shuffle(guildId);

    if (shuffled) {
      await this.nowPlayingService.sendNowPlaying(guildId);
    } else {
      await interaction.followUp({
        content: 'Cannot shuffle: not enough tracks in queue.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Button(NOW_PLAYING_BUTTON_IDS.LOOP)
  public async onLoopButton(@Ctx() [interaction]: ButtonContext) {
    if (!interaction.inGuild()) {
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member?.voice.channel) {
      return;
    }

    await interaction.deferUpdate();

    const guildId = interaction.guildId;
    this.musicService.cycleLoopMode(guildId);
    await this.nowPlayingService.sendNowPlaying(guildId);
  }
}
