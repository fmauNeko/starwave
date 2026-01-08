# Phase 2: Queue Enhancements Implementation

## Overview

This phase adds advanced queue manipulation features and playback tracking:

- **Move tracks** - Reorder queue items
- **Reverse queue** - Reverse queue order
- **Remove duplicates** - Deduplicate queue
- **Clear by user** - Remove all tracks from specific user
- **Play next** - Add track to priority position (after current)
- **Force play** - Play immediately, pushing current track to next
- **Progress/ETA tracking** - Show playback position and queue ETA
- **Live stream detection** - Handle streams without duration

---

## MusicQueue Class Extensions

### Extended MusicQueue Interface

```typescript
// apps/bot/src/discord/music/music-queue.ts (additions)

export interface Track {
  url: string;
  title: string;
  duration: number; // seconds, 0 for live streams
  thumbnail: string;
  requestedBy: string;
  provider: ProviderType;
  artist?: string;
  isLive?: boolean;
  addedAt: Date;
}

export interface QueueStats {
  totalTracks: number;
  totalDuration: number; // seconds
  currentPosition: number;
  remainingDuration: number;
  uniqueRequesters: number;
}

export class MusicQueue {
  // ... existing methods

  /**
   * Move a track from one position to another
   * @param from Source index (0-based)
   * @param to Destination index (0-based)
   * @returns The moved track, or undefined if invalid indices
   */
  public move(from: number, to: number): Track | undefined {
    if (
      from < 0 ||
      from >= this.tracks.length ||
      to < 0 ||
      to >= this.tracks.length ||
      from === to
    ) {
      return undefined;
    }

    // Cannot move the currently playing track
    if (from === this.currentIndex) {
      return undefined;
    }

    const [track] = this.tracks.splice(from, 1);
    if (!track) return undefined;

    // Adjust currentIndex if needed
    if (from < this.currentIndex && to >= this.currentIndex) {
      this.currentIndex--;
    } else if (from > this.currentIndex && to <= this.currentIndex) {
      this.currentIndex++;
    }

    this.tracks.splice(to, 0, track);
    return track;
  }

  /**
   * Reverse the order of upcoming tracks (after current)
   * @returns Number of tracks reversed
   */
  public reverse(): number {
    if (this.tracks.length <= 1) {
      return 0;
    }

    const upcoming = this.tracks.slice(this.currentIndex + 1);
    if (upcoming.length <= 1) {
      return 0;
    }

    upcoming.reverse();
    this.tracks = [...this.tracks.slice(0, this.currentIndex + 1), ...upcoming];

    return upcoming.length;
  }

  /**
   * Remove duplicate tracks from the queue (keeps first occurrence)
   * @returns Array of removed tracks
   */
  public removeDuplicates(): Track[] {
    const seen = new Set<string>();
    const removed: Track[] = [];
    const newTracks: Track[] = [];

    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      if (!track) continue;

      if (seen.has(track.url)) {
        // Don't remove current track even if duplicate
        if (i !== this.currentIndex) {
          removed.push(track);
          continue;
        }
      }

      seen.add(track.url);
      newTracks.push(track);
    }

    // Recalculate currentIndex
    const currentTrack = this.tracks[this.currentIndex];
    this.tracks = newTracks;
    if (currentTrack) {
      this.currentIndex = newTracks.findIndex(
        (t) => t.url === currentTrack.url,
      );
      if (this.currentIndex === -1) this.currentIndex = 0;
    }

    return removed;
  }

  /**
   * Remove all tracks added by a specific user
   * @param userId User tag to match (requestedBy field)
   * @returns Array of removed tracks
   */
  public clearByUser(userId: string): Track[] {
    const removed: Track[] = [];
    const currentTrack = this.tracks[this.currentIndex];

    this.tracks = this.tracks.filter((track, index) => {
      if (track.requestedBy === userId && index !== this.currentIndex) {
        removed.push(track);
        return false;
      }
      return true;
    });

    // Recalculate currentIndex
    if (currentTrack) {
      this.currentIndex = this.tracks.findIndex((t) => t === currentTrack);
      if (this.currentIndex === -1) this.currentIndex = 0;
    }

    return removed;
  }

  /**
   * Add a track to play immediately after the current track
   * @param track Track to add
   * @returns New position in queue (1-based for display)
   */
  public addNext(track: Track): number {
    const insertPosition = this.currentIndex + 1;
    this.tracks.splice(insertPosition, 0, track);
    return insertPosition + 1; // 1-based for user display
  }

  /**
   * Add multiple tracks to play after current track
   * @param tracks Tracks to add
   * @returns Number of tracks added
   */
  public addManyNext(tracks: Track[]): number {
    const insertPosition = this.currentIndex + 1;
    this.tracks.splice(insertPosition, 0, ...tracks);
    return tracks.length;
  }

  /**
   * Get queue statistics
   * @returns Queue stats object
   */
  public getStats(): QueueStats {
    const totalDuration = this.tracks.reduce(
      (sum, t) => sum + (t.duration || 0),
      0,
    );
    const playedDuration = this.tracks
      .slice(0, this.currentIndex)
      .reduce((sum, t) => sum + (t.duration || 0), 0);

    const uniqueRequesters = new Set(this.tracks.map((t) => t.requestedBy))
      .size;

    return {
      totalTracks: this.tracks.length,
      totalDuration,
      currentPosition: this.currentIndex,
      remainingDuration: totalDuration - playedDuration,
      uniqueRequesters,
    };
  }

  /**
   * Get estimated time until a specific track plays
   * @param index Track index (0-based)
   * @returns Estimated seconds until track plays, or -1 if invalid
   */
  public getEtaForTrack(index: number): number {
    if (
      index < 0 ||
      index >= this.tracks.length ||
      index <= this.currentIndex
    ) {
      return -1;
    }

    return this.tracks
      .slice(this.currentIndex, index)
      .reduce((sum, t) => sum + (t.duration || 0), 0);
  }

  /**
   * Check if a track is a live stream
   * @param index Track index (0-based)
   * @returns True if track is live or has no duration
   */
  public isLive(index?: number): boolean {
    const track = index !== undefined ? this.tracks[index] : this.getCurrent();
    return track?.isLive === true || track?.duration === 0;
  }
}
```

---

## MusicService Extensions

### Playback Tracking

```typescript
// apps/bot/src/discord/music/music.service.ts (additions)

interface PlaybackState {
  trackStartTime: number; // Unix timestamp when track started
  pausedAt: number | null; // Timestamp when paused, null if playing
  totalPausedDuration: number; // Accumulated pause time in ms
}

@Injectable()
export class MusicService {
  // ... existing properties
  private readonly playbackStates = new Map<string, PlaybackState>();

  /**
   * Get current playback progress for a guild
   * @returns Progress object with current position and total duration
   */
  public getProgress(
    guildId: string,
  ): { current: number; total: number; isLive: boolean } | null {
    const queue = this.queues.get(guildId);
    const state = this.playbackStates.get(guildId);
    const currentTrack = queue?.getCurrent();

    if (!queue || !state || !currentTrack) {
      return null;
    }

    if (currentTrack.isLive || currentTrack.duration === 0) {
      return { current: 0, total: 0, isLive: true };
    }

    const now = Date.now();
    let elapsed: number;

    if (state.pausedAt !== null) {
      // Currently paused
      elapsed =
        state.pausedAt - state.trackStartTime - state.totalPausedDuration;
    } else {
      // Currently playing
      elapsed = now - state.trackStartTime - state.totalPausedDuration;
    }

    const currentSeconds = Math.floor(elapsed / 1000);

    return {
      current: Math.min(currentSeconds, currentTrack.duration),
      total: currentTrack.duration,
      isLive: false,
    };
  }

  /**
   * Get time remaining in current track
   * @returns Seconds remaining, or -1 for live streams
   */
  public getTimeRemaining(guildId: string): number {
    const progress = this.getProgress(guildId);
    if (!progress || progress.isLive) {
      return -1;
    }
    return Math.max(0, progress.total - progress.current);
  }

  /**
   * Get ETA for entire queue
   * @returns Estimated seconds to complete queue, or -1 if contains live stream
   */
  public getQueueEta(guildId: string): number {
    const queue = this.queues.get(guildId);
    if (!queue) return 0;

    const stats = queue.getStats();
    const remaining = this.getTimeRemaining(guildId);

    if (remaining === -1) {
      return -1; // Current track is live
    }

    // Check if any upcoming track is live
    const upcoming = queue.getUpcoming();
    if (upcoming.some((t) => t.isLive || t.duration === 0)) {
      return -1;
    }

    const upcomingDuration = upcoming.reduce((sum, t) => sum + t.duration, 0);
    return remaining + upcomingDuration;
  }

  /**
   * Force play a track immediately, pushing current to next
   * @param guildId Guild ID
   * @param url Track URL
   * @param requestedBy User tag
   * @returns The track that was force-played
   */
  public async forcePlay(
    guildId: string,
    url: string,
    requestedBy: string,
  ): Promise<Track> {
    const provider = this.getProviderForUrl(url);
    const track = await provider.fetchTrackInfo(url, requestedBy);
    const queue = this.getOrCreateQueue(guildId);

    // Insert after current and skip to it
    queue.addNext(track);

    // Skip current track to play the new one
    const nextTrack = queue.skip();
    if (nextTrack) {
      await this.playTrack(guildId, nextTrack);
    }

    return track;
  }

  /**
   * Play next - add track to priority position
   * @param guildId Guild ID
   * @param url Track URL
   * @param requestedBy User tag
   * @returns Position in queue (1-based)
   */
  public async playNext(
    guildId: string,
    url: string,
    requestedBy: string,
  ): Promise<{ track: Track; position: number }> {
    const provider = this.getProviderForUrl(url);
    const track = await provider.fetchTrackInfo(url, requestedBy);
    const queue = this.getOrCreateQueue(guildId);

    const position = queue.addNext(track);

    // If queue was empty, start playback
    if (queue.size() === 1) {
      await this.playTrack(guildId, track);
    }

    return { track, position };
  }

  /**
   * Move a track in the queue
   * @returns The moved track or undefined
   */
  public move(guildId: string, from: number, to: number): Track | undefined {
    return this.queues.get(guildId)?.move(from, to);
  }

  /**
   * Reverse upcoming tracks in queue
   * @returns Number of tracks reversed
   */
  public reverse(guildId: string): number {
    return this.queues.get(guildId)?.reverse() ?? 0;
  }

  /**
   * Remove duplicate tracks
   * @returns Removed tracks
   */
  public removeDuplicates(guildId: string): Track[] {
    return this.queues.get(guildId)?.removeDuplicates() ?? [];
  }

  /**
   * Clear tracks by user
   * @returns Removed tracks
   */
  public clearByUser(guildId: string, userId: string): Track[] {
    return this.queues.get(guildId)?.clearByUser(userId) ?? [];
  }

  // Update playTrack to track timing
  private async playTrack(guildId: string, track: Track): Promise<void> {
    // ... existing implementation

    // Track playback start time
    this.playbackStates.set(guildId, {
      trackStartTime: Date.now(),
      pausedAt: null,
      totalPausedDuration: 0,
    });

    // ... rest of implementation
  }

  // Update pause to track timing
  public pause(guildId: string): boolean {
    const result = this.voiceService.pause(guildId);
    if (result) {
      const state = this.playbackStates.get(guildId);
      if (state && state.pausedAt === null) {
        state.pausedAt = Date.now();
      }
    }
    return result;
  }

  // Update resume to track timing
  public resume(guildId: string): boolean {
    const result = this.voiceService.unpause(guildId);
    if (result) {
      const state = this.playbackStates.get(guildId);
      if (state && state.pausedAt !== null) {
        state.totalPausedDuration += Date.now() - state.pausedAt;
        state.pausedAt = null;
      }
    }
    return result;
  }
}
```

---

## New Slash Commands

### Command Definitions

```typescript
// apps/bot/src/discord/music/music.commands.ts (additions)

class MoveDto {
  @IntegerOption({
    name: 'from',
    description: 'Current position of track (1-based)',
    required: true,
    min_value: 1,
  })
  from!: number;

  @IntegerOption({
    name: 'to',
    description: 'New position for track (1-based)',
    required: true,
    min_value: 1,
  })
  to!: number;
}

class ClearUserDto {
  @UserOption({
    name: 'user',
    description: 'User whose tracks to remove',
    required: true,
  })
  user!: User;
}

class PlayNextDto {
  @StringOption({
    name: 'query',
    description: 'YouTube URL or search query',
    required: true,
  })
  query!: string;
}

class ForcePlayDto {
  @StringOption({
    name: 'query',
    description: 'YouTube URL or search query',
    required: true,
  })
  query!: string;
}

// Add these commands to MusicCommands class

@SlashCommand({
  name: 'move',
  description: 'Move a track to a different position in the queue',
})
public move(
  @Context() [interaction]: SlashCommandContext,
  @Options() { from, to }: MoveDto,
) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const queue = this.musicService.getQueue(guildId);
  if (queue.length === 0) {
    return interaction.reply({
      content: 'The queue is empty.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Convert to 0-based indices
  const moved = this.musicService.move(guildId, from - 1, to - 1);

  if (!moved) {
    return interaction.reply({
      content: 'Could not move track. Check positions are valid and not the current track.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `Moved **${moved.title}** from position ${from} to ${to}.`,
  });
}

@SlashCommand({
  name: 'reverse',
  description: 'Reverse the order of upcoming tracks',
})
public reverse(@Context() [interaction]: SlashCommandContext) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const count = this.musicService.reverse(guildId);

  if (count === 0) {
    return interaction.reply({
      content: 'Not enough tracks to reverse.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `Reversed ${count} upcoming tracks.`,
  });
}

@SlashCommand({
  name: 'dedupe',
  description: 'Remove duplicate tracks from the queue',
})
public dedupe(@Context() [interaction]: SlashCommandContext) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = this.musicService.removeDuplicates(guildId);

  if (removed.length === 0) {
    return interaction.reply({
      content: 'No duplicates found in queue.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `Removed ${removed.length} duplicate track${removed.length === 1 ? '' : 's'}.`,
  });
}

@SlashCommand({
  name: 'clearuser',
  description: 'Remove all tracks added by a specific user',
})
public clearUser(
  @Context() [interaction]: SlashCommandContext,
  @Options() { user }: ClearUserDto,
) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = this.musicService.clearByUser(guildId, user.tag);

  if (removed.length === 0) {
    return interaction.reply({
      content: `No tracks found from ${user.username}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `Removed ${removed.length} track${removed.length === 1 ? '' : 's'} from ${user.username}.`,
  });
}

@SlashCommand({
  name: 'playnext',
  description: 'Add a track to play immediately after the current one',
})
public async playNext(
  @Context() [interaction]: SlashCommandContext,
  @Options() { query }: PlayNextDto,
) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({
      content: 'You must be in a voice channel to use this command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    if (!this.voiceService.isConnected(guildId)) {
      await this.voiceService.join(voiceChannel);
    }

    const isUrl = this.isValidUrl(query);
    let result: { track: Track; position: number };

    if (isUrl) {
      result = await this.musicService.playNext(guildId, query, interaction.user.tag);
    } else {
      // Search and play next
      const provider = this.musicService.getDefaultProvider();
      const track = await provider.search(query, interaction.user.tag);
      const queue = this.musicService.getQueue(guildId);
      // Manually add next
      const position = queue.addNext(track);
      result = { track, position };
    }

    this.musicService.setupAutoPlay(guildId);

    const embed = this.createTrackEmbed(result.track, 'Added to Play Next');
    embed.setFooter({ text: `Position: #${result.position}` });

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    this.logger.error('Failed to add track to play next', error);
    return interaction.editReply({
      content: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

@SlashCommand({
  name: 'forceplay',
  description: 'Play a track immediately, pushing current track to next',
})
public async forcePlay(
  @Context() [interaction]: SlashCommandContext,
  @Options() { query }: ForcePlayDto,
) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({
      content: 'You must be in a voice channel to use this command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    if (!this.voiceService.isConnected(guildId)) {
      await this.voiceService.join(voiceChannel);
    }

    this.nowPlayingService.setChannelForGuild(guildId, interaction.channelId);

    const isUrl = this.isValidUrl(query);
    const track = isUrl
      ? await this.musicService.forcePlay(guildId, query, interaction.user.tag)
      : await this.musicService.searchAndForcePlay(guildId, query, interaction.user.tag);

    this.musicService.setupAutoPlay(guildId);

    const embed = this.createTrackEmbed(track, 'Force Playing');
    await interaction.editReply({ embeds: [embed] });
    await this.nowPlayingService.sendNowPlaying(guildId);
  } catch (error) {
    this.logger.error('Failed to force play track', error);
    return interaction.editReply({
      content: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

@SlashCommand({
  name: 'remaining',
  description: 'Show time remaining in current track and queue',
})
public remaining(@Context() [interaction]: SlashCommandContext) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const progress = this.musicService.getProgress(guildId);
  const queueEta = this.musicService.getQueueEta(guildId);
  const currentTrack = this.musicService.getNowPlaying(guildId);

  if (!progress || !currentTrack) {
    return interaction.reply({
      content: 'Nothing is currently playing.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Time Remaining')
    .setColor(0x5865f2);

  if (progress.isLive) {
    embed.addFields({
      name: 'Current Track',
      value: `**${currentTrack.title}**\nLIVE STREAM`,
    });
  } else {
    const remaining = progress.total - progress.current;
    embed.addFields({
      name: 'Current Track',
      value: `**${currentTrack.title}**\n${this.formatDuration(progress.current)} / ${this.formatDuration(progress.total)} (${this.formatDuration(remaining)} remaining)`,
    });
  }

  if (queueEta === -1) {
    embed.addFields({
      name: 'Queue ETA',
      value: 'Unknown (contains live stream)',
    });
  } else if (queueEta > 0) {
    embed.addFields({
      name: 'Queue ETA',
      value: this.formatDuration(queueEta),
    });
  }

  return interaction.reply({ embeds: [embed] });
}

// Helper for progress bar
private createProgressBar(current: number, total: number): string {
  const barLength = 20;
  const progress = Math.min(current / total, 1);
  const filled = Math.round(barLength * progress);
  const empty = barLength - filled;

  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`;
}
```

---

## Updated Now Playing Display

### Progress Bar in Now Playing

```typescript
// apps/bot/src/discord/music/now-playing.service.ts (additions)

private createNowPlayingEmbed(
  guildId: string,
  track: Track,
  progress: { current: number; total: number; isLive: boolean } | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Now Playing')
    .setDescription(`**${track.title}**`)
    .setThumbnail(track.thumbnail)
    .setColor(this.getAccentColor(guildId));

  // Progress bar
  if (progress) {
    if (progress.isLive) {
      embed.addFields({
        name: 'Duration',
        value: 'LIVE',
        inline: true,
      });
    } else {
      const progressBar = this.createProgressBar(progress.current, progress.total);
      const timeDisplay = `${this.formatDuration(progress.current)} / ${this.formatDuration(progress.total)}`;

      embed.addFields({
        name: 'Progress',
        value: `${progressBar}\n${timeDisplay}`,
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: 'Duration',
      value: track.isLive ? 'LIVE' : this.formatDuration(track.duration),
      inline: true,
    });
  }

  // Requester
  embed.addFields({
    name: 'Requested by',
    value: track.requestedBy,
    inline: true,
  });

  // Provider badge
  if (track.provider) {
    embed.addFields({
      name: 'Source',
      value: PROVIDER_NAMES[track.provider] || track.provider,
      inline: true,
    });
  }

  // Queue info
  const upcoming = this.musicService.getUpcoming(guildId);
  if (upcoming.length > 0) {
    const queueEta = this.musicService.getQueueEta(guildId);
    const etaText = queueEta === -1 ? '' : ` (${this.formatDuration(queueEta)} total)`;
    embed.addFields({
      name: 'Up Next',
      value: `${upcoming.length} track${upcoming.length === 1 ? '' : 's'}${etaText}`,
      inline: true,
    });
  }

  embed.setURL(track.url);

  return embed;
}

private createProgressBar(current: number, total: number): string {
  const barLength = 15;
  const progress = Math.min(current / total, 1);
  const filled = Math.round(barLength * progress);
  const empty = barLength - filled;

  const filledChar = '\u2588'; // Full block
  const emptyChar = '\u2591';  // Light shade

  return `${filledChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}
```

---

## Updated Queue Display with ETA

```typescript
// apps/bot/src/discord/music/music.commands.ts (update queue command)

@SlashCommand({
  name: 'queue',
  description: 'Show the current queue with ETAs',
})
public queue(@Context() [interaction]: SlashCommandContext) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const queue = this.musicService.getQueue(guildId);
  const currentTrack = this.musicService.getNowPlaying(guildId);
  const loopMode = this.musicService.getLoopMode(guildId);
  const progress = this.musicService.getProgress(guildId);

  if (queue.length === 0) {
    return interaction.reply({
      content: 'The queue is empty.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Music Queue')
    .setColor(0x5865f2);

  // Current track with progress
  if (currentTrack) {
    let currentDisplay = `**${currentTrack.title}**`;

    if (progress && !progress.isLive) {
      const progressBar = this.createProgressBar(progress.current, progress.total);
      currentDisplay += `\n${progressBar} ${this.formatDuration(progress.current)} / ${this.formatDuration(progress.total)}`;
    } else if (currentTrack.isLive) {
      currentDisplay += '\nLIVE';
    }

    embed.addFields({
      name: 'Now Playing',
      value: currentDisplay,
    });
  }

  // Upcoming tracks with ETA
  const upcoming = this.musicService.getUpcoming(guildId);
  if (upcoming.length > 0) {
    let runningEta = progress ? progress.total - progress.current : 0;
    if (progress?.isLive) runningEta = 0;

    const upcomingList = upcoming
      .slice(0, 10)
      .map((track, i) => {
        const eta = runningEta > 0 && !track.isLive
          ? ` (in ${this.formatDuration(runningEta)})`
          : '';
        const duration = track.isLive ? 'LIVE' : this.formatDuration(track.duration);

        runningEta += track.duration || 0;

        return `${i + 1}. **${track.title}** [${duration}]${eta}`;
      })
      .join('\n');

    const totalEta = this.musicService.getQueueEta(guildId);
    const etaText = totalEta === -1 ? '' : ` | Total: ${this.formatDuration(totalEta)}`;

    embed.addFields({
      name: `Up Next (${upcoming.length} tracks)${etaText}`,
      value: upcomingList + (upcoming.length > 10 ? `\n... and ${upcoming.length - 10} more` : ''),
    });
  }

  const loopEmoji = this.getLoopModeEmoji(loopMode);
  embed.setFooter({ text: `Loop: ${loopEmoji} ${loopMode}` });

  return interaction.reply({ embeds: [embed] });
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// apps/bot/src/discord/music/music-queue.spec.ts (additions)

describe('MusicQueue - Phase 2', () => {
  let queue: MusicQueue;

  beforeEach(() => {
    queue = new MusicQueue();
    // Add test tracks
    queue.add(createTestTrack('Track 1', 'user1'));
    queue.add(createTestTrack('Track 2', 'user2'));
    queue.add(createTestTrack('Track 3', 'user1'));
    queue.add(createTestTrack('Track 4', 'user2'));
  });

  describe('move', () => {
    it('should move track from position A to B', () => {
      // Start playing first track
      queue.getCurrent();

      const moved = queue.move(2, 1); // Move Track 3 to position 2

      expect(moved?.title).toBe('Track 3');
      expect(queue.getAll()[1]?.title).toBe('Track 3');
      expect(queue.getAll()[2]?.title).toBe('Track 2');
    });

    it('should not move currently playing track', () => {
      const moved = queue.move(0, 2);
      expect(moved).toBeUndefined();
    });

    it('should return undefined for invalid indices', () => {
      expect(queue.move(-1, 2)).toBeUndefined();
      expect(queue.move(1, 100)).toBeUndefined();
    });
  });

  describe('reverse', () => {
    it('should reverse upcoming tracks', () => {
      // Start playing Track 1
      queue.getCurrent();

      const count = queue.reverse();

      expect(count).toBe(3);
      expect(queue.getAll()[1]?.title).toBe('Track 4');
      expect(queue.getAll()[2]?.title).toBe('Track 3');
      expect(queue.getAll()[3]?.title).toBe('Track 2');
    });

    it('should return 0 for single track queue', () => {
      const singleQueue = new MusicQueue();
      singleQueue.add(createTestTrack('Only Track', 'user'));

      expect(singleQueue.reverse()).toBe(0);
    });
  });

  describe('removeDuplicates', () => {
    it('should remove duplicate tracks', () => {
      // Add duplicate
      queue.add(createTestTrack('Track 1', 'user1'));

      const removed = queue.removeDuplicates();

      expect(removed.length).toBe(1);
      expect(removed[0]?.title).toBe('Track 1');
      expect(queue.size()).toBe(4);
    });

    it('should keep currently playing track even if duplicate', () => {
      queue.getCurrent(); // Start Track 1
      queue.add(createTestTrack('Track 1', 'user3'));

      const removed = queue.removeDuplicates();

      expect(removed.length).toBe(1);
      expect(queue.getCurrent()?.title).toBe('Track 1');
    });
  });

  describe('clearByUser', () => {
    it('should remove all tracks from specific user', () => {
      queue.getCurrent(); // Start Track 1

      const removed = queue.clearByUser('user2');

      expect(removed.length).toBe(2);
      expect(queue.size()).toBe(2);
      expect(queue.getAll().every((t) => t.requestedBy === 'user1')).toBe(true);
    });

    it('should not remove currently playing track', () => {
      queue.getCurrent();

      queue.clearByUser('user1');

      expect(queue.getCurrent()?.requestedBy).toBe('user1');
    });
  });

  describe('addNext', () => {
    it('should add track immediately after current', () => {
      queue.getCurrent();

      const position = queue.addNext(
        createTestTrack('Priority Track', 'user3'),
      );

      expect(position).toBe(2); // 1-based position
      expect(queue.getAll()[1]?.title).toBe('Priority Track');
    });
  });

  describe('getStats', () => {
    it('should return correct queue statistics', () => {
      const stats = queue.getStats();

      expect(stats.totalTracks).toBe(4);
      expect(stats.uniqueRequesters).toBe(2);
      expect(stats.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('getEtaForTrack', () => {
    it('should calculate ETA for upcoming track', () => {
      queue.getCurrent();

      const eta = queue.getEtaForTrack(2);

      expect(eta).toBe(
        queue.getAll()[0]!.duration + queue.getAll()[1]!.duration,
      );
    });

    it('should return -1 for past or invalid tracks', () => {
      queue.getCurrent();

      expect(queue.getEtaForTrack(0)).toBe(-1); // Current
      expect(queue.getEtaForTrack(-1)).toBe(-1); // Invalid
      expect(queue.getEtaForTrack(100)).toBe(-1); // Out of bounds
    });
  });
});

function createTestTrack(title: string, requestedBy: string): Track {
  return {
    url: `https://example.com/${title.replace(' ', '-')}`,
    title,
    duration: 180,
    thumbnail: 'https://example.com/thumb.jpg',
    requestedBy,
    provider: ProviderType.YouTube,
    isLive: false,
    addedAt: new Date(),
  };
}
```

---

## Checklist

### Files to Modify

- [ ] `apps/bot/src/discord/music/music-queue.ts`
  - [ ] Add `move()` method
  - [ ] Add `reverse()` method
  - [ ] Add `removeDuplicates()` method
  - [ ] Add `clearByUser()` method
  - [ ] Add `addNext()` method
  - [ ] Add `addManyNext()` method
  - [ ] Add `getStats()` method
  - [ ] Add `getEtaForTrack()` method
  - [ ] Add `isLive()` method

- [ ] `apps/bot/src/discord/music/music.service.ts`
  - [ ] Add playback state tracking
  - [ ] Add `getProgress()` method
  - [ ] Add `getTimeRemaining()` method
  - [ ] Add `getQueueEta()` method
  - [ ] Add `forcePlay()` method
  - [ ] Add `playNext()` method
  - [ ] Add `move()` wrapper
  - [ ] Add `reverse()` wrapper
  - [ ] Add `removeDuplicates()` wrapper
  - [ ] Add `clearByUser()` wrapper
  - [ ] Update `pause()` for timing
  - [ ] Update `resume()` for timing

- [ ] `apps/bot/src/discord/music/music.commands.ts`
  - [ ] Add `/music move` command
  - [ ] Add `/music reverse` command
  - [ ] Add `/music dedupe` command
  - [ ] Add `/music clearuser` command
  - [ ] Add `/music playnext` command
  - [ ] Add `/music forceplay` command
  - [ ] Add `/music remaining` command
  - [ ] Update `/music queue` with ETAs

- [ ] `apps/bot/src/discord/music/now-playing.service.ts`
  - [ ] Add progress bar to embed
  - [ ] Show live stream indicator
  - [ ] Show queue ETA

- [ ] `apps/bot/src/discord/music/music-queue.spec.ts`
  - [ ] Add tests for move
  - [ ] Add tests for reverse
  - [ ] Add tests for removeDuplicates
  - [ ] Add tests for clearByUser
  - [ ] Add tests for addNext
  - [ ] Add tests for stats/ETA

- [ ] `apps/bot/src/discord/music/music.service.spec.ts`
  - [ ] Add tests for progress tracking
  - [ ] Add tests for forcePlay
  - [ ] Add tests for playNext

### Estimated Effort

| Task                | Complexity | Time            |
| ------------------- | ---------- | --------------- |
| Queue methods       | S          | 2-3 hours       |
| Service methods     | M          | 3-4 hours       |
| Commands            | M          | 3-4 hours       |
| Now Playing updates | S          | 1-2 hours       |
| Tests               | M          | 3-4 hours       |
| **Total**           |            | **12-17 hours** |
