import { Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import {
  Context,
  Options,
  createCommandGroupDecorator,
  SlashCommand,
  StringOption,
  IntegerOption,
  type SlashCommandContext,
} from 'necord';
import { VoiceService } from '../voice/voice.service';
import { LoopMode, type Track } from './music-queue';
import { MusicService } from './music.service';

class PlayDto {
  @StringOption({
    name: 'url',
    description: 'YouTube URL to play',
    required: true,
  })
  url!: string;
}

class RemoveDto {
  @IntegerOption({
    name: 'position',
    description: 'Position of the track to remove (1-based)',
    required: true,
    min_value: 1,
  })
  position!: number;
}

const MusicCommandDecorator = createCommandGroupDecorator({
  name: 'music',
  description: 'Music playback commands',
});

@Injectable()
@MusicCommandDecorator()
export class MusicCommands {
  private readonly logger = new Logger(MusicCommands.name);

  public constructor(
    private readonly musicService: MusicService,
    private readonly voiceService: VoiceService,
  ) {}

  @SlashCommand({
    name: 'play',
    description: 'Play a YouTube video in voice channel',
  })
  public async play(
    @Context() [interaction]: SlashCommandContext,
    @Options() { url }: PlayDto,
  ) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const voiceChannel = member?.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: 'You must be in a voice channel to use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      if (!this.voiceService.isConnected(guildId)) {
        await this.voiceService.join(voiceChannel);
        this.musicService.setupAutoPlay(guildId);
      }

      const track = await this.musicService.play(
        guildId,
        url,
        interaction.user.tag,
      );

      const embed = this.createTrackEmbed(track, 'Added to Queue');
      return await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Failed to play track', error);
      return interaction.editReply({
        content: `Failed to play: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  @SlashCommand({
    name: 'skip',
    description: 'Skip the current track',
  })
  public skip(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const nextTrack = this.musicService.skip(guildId);

    if (nextTrack) {
      const embed = this.createTrackEmbed(nextTrack, 'Now Playing');
      return interaction.reply({ embeds: [embed] });
    }

    return interaction.reply({ content: 'Skipped. No more tracks in queue.' });
  }

  @SlashCommand({
    name: 'stop',
    description: 'Stop playback and clear the queue',
  })
  public stop(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const stopped = this.musicService.stop(guildId);

    if (!stopped) {
      return interaction.reply({
        content: 'Nothing is playing.',
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: 'Stopped playback and cleared the queue.',
    });
  }

  @SlashCommand({
    name: 'pause',
    description: 'Pause the current track',
  })
  public pause(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const paused = this.musicService.pause(guildId);

    if (!paused) {
      return interaction.reply({
        content: 'Nothing is playing or already paused.',
        ephemeral: true,
      });
    }

    return interaction.reply({ content: '⏸️ Paused.' });
  }

  @SlashCommand({
    name: 'resume',
    description: 'Resume playback',
  })
  public resume(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const resumed = this.musicService.resume(guildId);

    if (!resumed) {
      return interaction.reply({
        content: 'Nothing to resume.',
        ephemeral: true,
      });
    }

    return interaction.reply({ content: '▶️ Resumed.' });
  }

  @SlashCommand({
    name: 'nowplaying',
    description: 'Show the currently playing track',
  })
  public nowPlaying(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const track = this.musicService.getNowPlaying(guildId);

    if (!track) {
      return interaction.reply({
        content: 'Nothing is currently playing.',
        ephemeral: true,
      });
    }

    const embed = this.createTrackEmbed(track, 'Now Playing');
    return interaction.reply({ embeds: [embed] });
  }

  @SlashCommand({
    name: 'queue',
    description: 'Show the current queue',
  })
  public queue(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const queue = this.musicService.getQueue(guildId);
    const currentTrack = this.musicService.getNowPlaying(guildId);
    const loopMode = this.musicService.getLoopMode(guildId);

    if (queue.length === 0) {
      return interaction.reply({
        content: 'The queue is empty.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎵 Music Queue')
      .setColor(0x5865f2);

    if (currentTrack) {
      embed.addFields({
        name: '▶️ Now Playing',
        value: `**${currentTrack.title}** (${this.formatDuration(currentTrack.duration)})`,
      });
    }

    const upcoming = this.musicService.getUpcoming(guildId);
    if (upcoming.length > 0) {
      const upcomingList = upcoming
        .slice(0, 10)
        .map(
          (track, i) =>
            `${String(i + 1)}. **${track.title}** (${this.formatDuration(track.duration)})`,
        )
        .join('\n');

      embed.addFields({
        name: `📋 Up Next (${String(upcoming.length)} tracks)`,
        value:
          upcomingList +
          (upcoming.length > 10
            ? `\n... and ${String(upcoming.length - 10)} more`
            : ''),
      });
    }

    const loopEmoji = this.getLoopModeEmoji(loopMode);
    embed.setFooter({ text: `Loop: ${loopEmoji} ${loopMode}` });

    return interaction.reply({ embeds: [embed] });
  }

  @SlashCommand({
    name: 'clear',
    description: 'Clear the queue (keeps current track)',
  })
  public clear(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const cleared = this.musicService.clearQueue(guildId);

    if (!cleared) {
      return interaction.reply({
        content: 'The queue is already empty.',
        ephemeral: true,
      });
    }

    return interaction.reply({ content: '🗑️ Queue cleared.' });
  }

  @SlashCommand({
    name: 'shuffle',
    description: 'Shuffle the queue',
  })
  public shuffle(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const shuffled = this.musicService.shuffle(guildId);

    if (!shuffled) {
      return interaction.reply({
        content: 'Not enough tracks to shuffle.',
        ephemeral: true,
      });
    }

    return interaction.reply({ content: '🔀 Queue shuffled.' });
  }

  @SlashCommand({
    name: 'loop',
    description: 'Cycle through loop modes (none → track → queue)',
  })
  public loop(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const newMode = this.musicService.cycleLoopMode(guildId);
    const emoji = this.getLoopModeEmoji(newMode);

    return interaction.reply({ content: `${emoji} Loop mode: **${newMode}**` });
  }

  @SlashCommand({
    name: 'remove',
    description: 'Remove a track from the queue',
  })
  public remove(
    @Context() [interaction]: SlashCommandContext,
    @Options() { position }: RemoveDto,
  ) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    const removed = this.musicService.remove(guildId, position - 1);

    if (!removed) {
      return interaction.reply({
        content:
          'Could not remove track. Invalid position or currently playing.',
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `Removed **${removed.title}** from the queue.`,
    });
  }

  @SlashCommand({
    name: 'disconnect',
    description: 'Disconnect from voice and clear queue',
  })
  public disconnect(@Context() [interaction]: SlashCommandContext) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    }

    this.musicService.cleanup(guildId);
    const disconnected = this.voiceService.leave(guildId);

    if (!disconnected) {
      return interaction.reply({
        content: "I'm not connected to a voice channel.",
        ephemeral: true,
      });
    }

    return interaction.reply({ content: '👋 Disconnected.' });
  }

  private createTrackEmbed(track: Track, title: string): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(`**${track.title}**`)
      .setThumbnail(track.thumbnail)
      .addFields(
        {
          name: 'Duration',
          value: this.formatDuration(track.duration),
          inline: true,
        },
        { name: 'Requested by', value: track.requestedBy, inline: true },
      )
      .setColor(0xff0000)
      .setURL(track.url);
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${String(hours)}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes)}:${String(secs).padStart(2, '0')}`;
  }

  private getLoopModeEmoji(mode: LoopMode): string {
    switch (mode) {
      case LoopMode.None:
        return '➡️';
      case LoopMode.Track:
        return '🔂';
      case LoopMode.Queue:
        return '🔁';
    }
  }
}
