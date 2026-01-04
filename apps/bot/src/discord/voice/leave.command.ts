import { Injectable } from '@nestjs/common';
import { MessageFlags } from 'discord.js';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';
import { MusicService } from '../music/music.service';
import { VoiceInactivityService } from './voice-inactivity.service';
import { VoiceService } from './voice.service';

@Injectable()
export class LeaveCommand {
  public constructor(
    private readonly voiceService: VoiceService,
    private readonly musicService: MusicService,
    private readonly voiceInactivityService: VoiceInactivityService,
  ) {}

  @SlashCommand({
    name: 'leave',
    description: 'Make the bot leave the voice channel',
  })
  public leave(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!this.voiceService.isConnected(guildId)) {
      return interaction.reply({
        content: "I'm not connected to a voice channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    this.voiceInactivityService.cancelTimer(guildId);
    this.musicService.cleanup(guildId);
    this.voiceService.leave(guildId);

    return interaction.reply({ content: '👋 Left the voice channel.' });
  }
}
