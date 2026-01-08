# Phase 3: Extras Implementation

## Overview

This phase adds advanced features to enhance the music experience:

- **Lyrics** - Genius API integration for fetching song lyrics
- **Radio streaming** - 2500+ French radio stations
- **Voting system** - Democratic control for queue operations
- **Genre playlists** - Quick access to curated music (Synthwave, Disco, Electro)
- **Autodisplay** - Automatic now playing announcements

---

## 1. Lyrics Service

### LyricsService Implementation

```typescript
// apps/bot/src/discord/music/lyrics/lyrics.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotConfig } from '../../../config/config.type';

export interface LyricsResult {
  title: string;
  artist: string;
  lyrics: string;
  albumArt: string;
  url: string;
}

@Injectable()
export class LyricsService implements OnModuleInit {
  private readonly logger = new Logger(LyricsService.name);
  private geniusApiKey: string | null = null;

  constructor(private readonly configService: ConfigService<BotConfig>) {}

  public onModuleInit(): void {
    this.geniusApiKey =
      this.configService.get('genius.apiKey', { infer: true }) ?? null;

    if (!this.geniusApiKey) {
      this.logger.warn(
        'Genius API key not configured. Lyrics feature will be disabled.',
      );
    }
  }

  public isEnabled(): boolean {
    return this.geniusApiKey !== null;
  }

  /**
   * Search for lyrics by song title and optionally artist
   * @param query Search query (song title, optionally with artist)
   * @returns Lyrics result or null if not found
   */
  public async searchLyrics(query: string): Promise<LyricsResult | null> {
    if (!this.geniusApiKey) {
      return null;
    }

    try {
      // Clean up the query - remove common video title artifacts
      const cleanQuery = this.cleanSearchQuery(query);

      // Search for song on Genius
      const searchResponse = await fetch(
        `https://api.genius.com/search?q=${encodeURIComponent(cleanQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${this.geniusApiKey}`,
          },
        },
      );

      if (!searchResponse.ok) {
        this.logger.error(`Genius search failed: ${searchResponse.status}`);
        return null;
      }

      const searchData = (await searchResponse.json()) as {
        response: {
          hits: Array<{
            result: {
              id: number;
              title: string;
              artist_names: string;
              song_art_image_url: string;
              url: string;
              path: string;
            };
          }>;
        };
      };

      const hits = searchData.response.hits;
      if (hits.length === 0) {
        return null;
      }

      const song = hits[0].result;

      // Fetch lyrics by scraping the Genius page
      const lyrics = await this.fetchLyricsFromPage(song.url);

      if (!lyrics) {
        return {
          title: song.title,
          artist: song.artist_names,
          lyrics: '',
          albumArt: song.song_art_image_url,
          url: song.url,
        };
      }

      return {
        title: song.title,
        artist: song.artist_names,
        lyrics,
        albumArt: song.song_art_image_url,
        url: song.url,
      };
    } catch (error) {
      this.logger.error('Failed to fetch lyrics', error);
      return null;
    }
  }

  /**
   * Clean up a search query by removing common video title artifacts
   */
  private cleanSearchQuery(query: string): string {
    return (
      query
        // Remove content in parentheses (Official Video, Lyrics, etc.)
        .replace(/\(.[^(]*\)/g, '')
        // Remove content in brackets [Official Audio], etc.
        .replace(/\[.[^\[]*\]/g, '')
        // Remove common suffixes
        .replace(
          /(official|video|audio|lyrics|lyric|hd|hq|4k|visualizer|music video)/gi,
          '',
        )
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * Fetch lyrics from Genius page
   * Note: This uses the unofficial lyrics endpoint
   */
  private async fetchLyricsFromPage(url: string): Promise<string | null> {
    try {
      // Use the Genius lyrics API endpoint
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const html = await response.text();

      // Extract lyrics from the page HTML
      // Genius wraps lyrics in data-lyrics-container divs
      const lyricsMatch = html.match(
        /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g,
      );

      if (!lyricsMatch) {
        return null;
      }

      // Clean up HTML and extract text
      let lyrics = lyricsMatch
        .join('\n')
        // Replace <br> with newlines
        .replace(/<br\s*\/?>/gi, '\n')
        // Remove all HTML tags
        .replace(/<[^>]+>/g, '')
        // Decode HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // Clean up whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return lyrics;
    } catch (error) {
      this.logger.error('Failed to scrape lyrics', error);
      return null;
    }
  }

  /**
   * Split lyrics into chunks for Discord embeds (max 4096 chars per embed)
   */
  public splitLyrics(lyrics: string, maxLength: number = 4000): string[] {
    if (lyrics.length <= maxLength) {
      return [lyrics];
    }

    const chunks: string[] = [];
    const paragraphs = lyrics.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
```

### Lyrics Commands

```typescript
// apps/bot/src/discord/music/lyrics/lyrics.commands.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
  StringOption,
} from 'necord';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { LyricsService } from './lyrics.service';
import { MusicService } from '../music.service';

class LyricsDto {
  @StringOption({
    name: 'query',
    description: 'Song title to search (defaults to current track)',
    required: false,
  })
  query?: string;
}

@Injectable()
export class LyricsCommands {
  private readonly logger = new Logger(LyricsCommands.name);

  constructor(
    private readonly lyricsService: LyricsService,
    private readonly musicService: MusicService,
  ) {}

  @SlashCommand({
    name: 'lyrics',
    description: 'Get lyrics for the current song or search by title',
  })
  public async lyrics(
    @Context() [interaction]: SlashCommandContext,
    @Options() { query }: LyricsDto,
  ) {
    if (!this.lyricsService.isEnabled()) {
      return interaction.reply({
        content: 'Lyrics feature is not configured.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guildId;

    // If no query provided, use current track title
    let searchQuery = query;
    if (!searchQuery && guildId) {
      const currentTrack = this.musicService.getNowPlaying(guildId);
      if (currentTrack) {
        searchQuery = currentTrack.title;
      }
    }

    if (!searchQuery) {
      return interaction.reply({
        content: 'Please provide a song title or have a track playing.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const result = await this.lyricsService.searchLyrics(searchQuery);

    if (!result) {
      return interaction.editReply({
        content: `No lyrics found for **${searchQuery}**.`,
      });
    }

    if (!result.lyrics) {
      const embed = new EmbedBuilder()
        .setTitle(result.title)
        .setAuthor({ name: result.artist })
        .setThumbnail(result.albumArt)
        .setDescription(
          `Lyrics found but content exceeds Discord limits.\n**[View on Genius](${result.url})**`,
        )
        .setColor(0xffff64)
        .setFooter({
          text: 'Powered by Genius',
          iconURL:
            'https://images.genius.com/8ed669cadd956443e29c70361ec4f372.1000x1000x1.png',
        });

      return interaction.editReply({ embeds: [embed] });
    }

    const chunks = this.lyricsService.splitLyrics(result.lyrics);

    // Send first chunk as reply
    const firstEmbed = new EmbedBuilder()
      .setTitle(result.title)
      .setAuthor({ name: result.artist })
      .setThumbnail(result.albumArt)
      .setDescription(`**[View on Genius](${result.url})**\n\n${chunks[0]}`)
      .setColor(0xffff64)
      .setFooter({
        text: 'Powered by Genius',
        iconURL:
          'https://images.genius.com/8ed669cadd956443e29c70361ec4f372.1000x1000x1.png',
      });

    await interaction.editReply({ embeds: [firstEmbed] });

    // Send remaining chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
      const continueEmbed = new EmbedBuilder()
        .setTitle(`${result.title} (continued)`)
        .setDescription(chunks[i])
        .setColor(0xffff64);

      await interaction.followUp({ embeds: [continueEmbed] });
    }
  }
}
```

### Lyrics Module

```typescript
// apps/bot/src/discord/music/lyrics/lyrics.module.ts

import { Module } from '@nestjs/common';
import { LyricsService } from './lyrics.service';
import { LyricsCommands } from './lyrics.commands';

@Module({
  providers: [LyricsService, LyricsCommands],
  exports: [LyricsService],
})
export class LyricsModule {}
```

---

## 2. Radio Service

### Radio Types

```typescript
// apps/bot/src/discord/music/radio/radio.types.ts

export interface RadioStation {
  title: string;
  flux: string; // Stream URL
  logo?: string;
  genre?: string;
  country?: string;
}

export interface RadioSearchResult {
  stations: RadioStation[];
  totalMatches: number;
}
```

### RadioService Implementation

```typescript
// apps/bot/src/discord/music/radio/radio.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotConfig } from '../../../config/config.type';
import type { RadioStation, RadioSearchResult } from './radio.types';

const DEFAULT_STATIONS_URL = 'https://radios.music-hub.fr/radios/all.json';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

@Injectable()
export class RadioService implements OnModuleInit {
  private readonly logger = new Logger(RadioService.name);
  private stationsUrl: string;
  private stationsCache: RadioStation[] = [];
  private lastFetchTime = 0;

  constructor(private readonly configService: ConfigService<BotConfig>) {
    this.stationsUrl =
      this.configService.get('radio.stationsUrl', { infer: true }) ??
      DEFAULT_STATIONS_URL;
  }

  public async onModuleInit(): Promise<void> {
    // Pre-fetch stations on startup
    await this.fetchStations();
  }

  /**
   * Fetch stations from remote JSON endpoint
   */
  private async fetchStations(): Promise<RadioStation[]> {
    const now = Date.now();

    // Return cached if still valid
    if (
      this.stationsCache.length > 0 &&
      now - this.lastFetchTime < CACHE_TTL_MS
    ) {
      return this.stationsCache;
    }

    try {
      this.logger.log(`Fetching radio stations from ${this.stationsUrl}`);
      const response = await fetch(this.stationsUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch stations: ${response.status}`);
      }

      const data = (await response.json()) as RadioStation[];
      this.stationsCache = data;
      this.lastFetchTime = now;

      this.logger.log(`Loaded ${data.length} radio stations`);
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch radio stations', error);

      // Return cached data if available, even if stale
      if (this.stationsCache.length > 0) {
        return this.stationsCache;
      }

      return [];
    }
  }

  /**
   * Search for radio stations by keyword
   * @param keywords Search keywords
   * @param limit Maximum results to return (default 16)
   * @returns Search results with matching stations and total count
   */
  public async search(
    keywords: string,
    limit: number = 16,
  ): Promise<RadioSearchResult> {
    const stations = await this.fetchStations();
    const lowerKeywords = keywords.toLowerCase();

    const matches = stations.filter((station) =>
      station.title.toLowerCase().includes(lowerKeywords),
    );

    return {
      stations: matches.slice(0, limit),
      totalMatches: matches.length,
    };
  }

  /**
   * Get a random radio station
   */
  public async getRandomStation(): Promise<RadioStation | null> {
    const stations = await this.fetchStations();

    if (stations.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * stations.length);
    return stations[randomIndex] ?? null;
  }

  /**
   * Get total station count
   */
  public async getStationCount(): Promise<number> {
    const stations = await this.fetchStations();
    return stations.length;
  }
}
```

### Radio Commands

```typescript
// apps/bot/src/discord/music/radio/radio.commands.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
  StringOption,
  IntegerOption,
} from 'necord';
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  MessageFlags,
  ComponentType,
} from 'discord.js';
import { RadioService } from './radio.service';
import { MusicService } from '../music.service';
import { VoiceService } from '../voice.service';
import { ProviderType } from '../providers/provider-types';
import type { Track } from '../music-queue';

class RadioSearchDto {
  @StringOption({
    name: 'query',
    description: 'Radio station name to search',
    required: true,
  })
  query!: string;
}

@Injectable()
export class RadioCommands {
  private readonly logger = new Logger(RadioCommands.name);

  constructor(
    private readonly radioService: RadioService,
    private readonly musicService: MusicService,
    private readonly voiceService: VoiceService,
  ) {}

  @SlashCommand({
    name: 'radio',
    description: 'Search and play from 2500+ French radio stations',
  })
  public async radio(
    @Context() [interaction]: SlashCommandContext,
    @Options() { query }: RadioSearchDto,
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

    const results = await this.radioService.search(query);

    if (results.stations.length === 0) {
      return interaction.editReply({
        content: `No radio stations found for **${query}**.`,
      });
    }

    // Build select menu
    const selectOptions = results.stations.map((station, index) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(station.title.slice(0, 100))
        .setValue(index.toString())
        .setDescription('Click to play'),
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('radio_select')
      .setPlaceholder('Select a radio station')
      .addOptions(selectOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    // Build results embed
    const embed = new EmbedBuilder()
      .setTitle('Radio Search')
      .setDescription(
        `Found **${results.totalMatches}** stations matching **${query}**\n\n` +
          results.stations
            .map((s, i) => `\`${i + 1}.\` **${s.title}**`)
            .join('\n') +
          (results.totalMatches > 16
            ? `\n\n*...and ${results.totalMatches - 16} more*`
            : ''),
      )
      .setColor(0xc45c60)
      .setFooter({
        text: 'Select a station from the dropdown below',
        iconURL: 'https://cdn-icons-png.flaticon.com/512/3659/3659784.png',
      });

    const response = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Collector for select menu
    try {
      const selectInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });

      const selectedIndex = parseInt(selectInteraction.values[0] ?? '0', 10);
      const station = results.stations[selectedIndex];

      if (!station) {
        return selectInteraction.update({
          content: 'Invalid selection.',
          embeds: [],
          components: [],
        });
      }

      // Join voice if needed
      if (!this.voiceService.isConnected(guildId)) {
        await this.voiceService.join(voiceChannel);
      }

      // Create track from radio station
      const track: Track = {
        url: station.flux,
        title: station.title,
        duration: 0, // Live stream
        thumbnail:
          station.logo ??
          'https://cdn-icons-png.flaticon.com/512/3659/3659784.png',
        requestedBy: interaction.user.tag,
        provider: ProviderType.Radio,
        isLive: true,
        addedAt: new Date(),
      };

      const position = this.musicService.addToQueue(guildId, track);
      this.musicService.setupAutoPlay(guildId);

      const playEmbed = new EmbedBuilder()
        .setTitle('Radio Station')
        .setDescription(`**${station.title}**`)
        .setThumbnail(track.thumbnail)
        .setColor(0xc45c60)
        .addFields(
          { name: 'Requested by', value: interaction.user.tag, inline: true },
          { name: 'Type', value: 'LIVE STREAM', inline: true },
          { name: 'Position', value: `#${position}`, inline: true },
        )
        .setFooter({
          text: 'Radio streaming',
          iconURL: 'https://cdn-icons-png.flaticon.com/512/3659/3659784.png',
        });

      await selectInteraction.update({
        embeds: [playEmbed],
        components: [],
      });
    } catch {
      // Timeout - remove components
      await interaction.editReply({
        embeds: [embed.setFooter({ text: 'Selection timed out' })],
        components: [],
      });
    }
  }
}
```

### Radio Module

```typescript
// apps/bot/src/discord/music/radio/radio.module.ts

import { Module } from '@nestjs/common';
import { RadioService } from './radio.service';
import { RadioCommands } from './radio.commands';

@Module({
  providers: [RadioService, RadioCommands],
  exports: [RadioService],
})
export class RadioModule {}
```

---

## 3. Voting Service

### Voting Types

```typescript
// apps/bot/src/discord/music/voting/voting.types.ts

export enum VoteAction {
  Skip = 'skip',
  Shuffle = 'shuffle',
  Reverse = 'reverse',
  Clear = 'clear',
  Stop = 'stop',
  Pause = 'pause',
  Resume = 'resume',
}

export interface VoteState {
  action: VoteAction;
  voters: Set<string>; // User IDs
  requiredVotes: number;
  startedAt: Date;
  startedBy: string;
}

export interface VotingConfig {
  enabled: boolean;
  thresholdPercent: number; // Default 50 (majority)
  minVoters: number; // Minimum votes required regardless of percentage
  bypassPermission: bigint; // Permission to bypass voting (e.g., KICK_MEMBERS)
}
```

### VotingService Implementation

```typescript
// apps/bot/src/discord/music/voting/voting.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionFlagsBits, VoiceChannel, GuildMember } from 'discord.js';
import type { BotConfig } from '../../../config/config.type';
import { VoteAction, VoteState, VotingConfig } from './voting.types';

@Injectable()
export class VotingService {
  private readonly logger = new Logger(VotingService.name);

  // Map<guildId, Map<action, VoteState>>
  private readonly votes = new Map<string, Map<VoteAction, VoteState>>();

  private readonly config: VotingConfig;

  constructor(configService: ConfigService<BotConfig>) {
    this.config = {
      enabled: configService.get('voting.enabled', { infer: true }) ?? true,
      thresholdPercent:
        configService.get('voting.thresholdPercent', { infer: true }) ?? 50,
      minVoters: configService.get('voting.minVoters', { infer: true }) ?? 2,
      bypassPermission: PermissionFlagsBits.KickMembers,
    };
  }

  /**
   * Check if voting is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if a member can bypass voting (has staff permissions)
   */
  public canBypass(member: GuildMember): boolean {
    return member.permissions.has(this.config.bypassPermission);
  }

  /**
   * Calculate required votes based on voice channel members
   * @param voiceChannel The voice channel to check
   * @returns Number of votes required
   */
  public calculateRequiredVotes(voiceChannel: VoiceChannel): number {
    // Count non-bot members in voice channel
    const humanMembers = voiceChannel.members.filter((m) => !m.user.bot).size;

    // Calculate threshold (majority)
    const byPercent = Math.ceil(
      (humanMembers * this.config.thresholdPercent) / 100,
    );

    // Return the higher of percentage or minimum
    return Math.max(byPercent, this.config.minVoters);
  }

  /**
   * Register a vote for an action
   * @returns Object with vote status
   */
  public vote(
    guildId: string,
    action: VoteAction,
    userId: string,
    voiceChannel: VoiceChannel,
  ): {
    success: boolean;
    alreadyVoted: boolean;
    currentVotes: number;
    requiredVotes: number;
    voters: string[];
    passed: boolean;
  } {
    // Get or create guild votes
    let guildVotes = this.votes.get(guildId);
    if (!guildVotes) {
      guildVotes = new Map();
      this.votes.set(guildId, guildVotes);
    }

    // Get or create vote state for action
    let voteState = guildVotes.get(action);
    const requiredVotes = this.calculateRequiredVotes(voiceChannel);

    if (!voteState) {
      voteState = {
        action,
        voters: new Set(),
        requiredVotes,
        startedAt: new Date(),
        startedBy: userId,
      };
      guildVotes.set(action, voteState);
    }

    // Update required votes in case members changed
    voteState.requiredVotes = requiredVotes;

    // Check if already voted
    if (voteState.voters.has(userId)) {
      return {
        success: false,
        alreadyVoted: true,
        currentVotes: voteState.voters.size,
        requiredVotes,
        voters: Array.from(voteState.voters),
        passed: false,
      };
    }

    // Add vote
    voteState.voters.add(userId);

    const passed = voteState.voters.size >= requiredVotes;

    // Reset if passed
    if (passed) {
      this.resetVotes(guildId, action);
    }

    return {
      success: true,
      alreadyVoted: false,
      currentVotes: voteState.voters.size,
      requiredVotes,
      voters: Array.from(voteState.voters),
      passed,
    };
  }

  /**
   * Reset votes for a specific action
   */
  public resetVotes(guildId: string, action: VoteAction): void {
    const guildVotes = this.votes.get(guildId);
    if (guildVotes) {
      guildVotes.delete(action);
    }
  }

  /**
   * Reset all votes for a guild
   */
  public resetAllVotes(guildId: string): void {
    this.votes.delete(guildId);
  }

  /**
   * Get current vote state for an action
   */
  public getVoteState(
    guildId: string,
    action: VoteAction,
  ): VoteState | undefined {
    return this.votes.get(guildId)?.get(action);
  }

  /**
   * Get voters display string
   */
  public getVotersDisplay(guildId: string, action: VoteAction): string {
    const state = this.getVoteState(guildId, action);
    if (!state || state.voters.size === 0) {
      return 'No votes yet';
    }

    return `**Voters (${state.voters.size}):** ${Array.from(state.voters)
      .map((id) => `<@${id}>`)
      .join(' ')}`;
  }
}
```

### Voting Module

```typescript
// apps/bot/src/discord/music/voting/voting.module.ts

import { Module } from '@nestjs/common';
import { VotingService } from './voting.service';

@Module({
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
```

### Integrating Voting with Music Commands

Update `music.commands.ts` to use voting:

```typescript
// apps/bot/src/discord/music/music.commands.ts (additions for voting)

import { VotingService } from './voting/voting.service';
import { VoteAction } from './voting/voting.types';

// Inject VotingService in constructor
constructor(
  // ... existing services
  private readonly votingService: VotingService,
) {}

// Update skip command to use voting
@SlashCommand({
  name: 'skip',
  description: 'Skip the current track',
})
public async skip(@Context() [interaction]: SlashCommandContext) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel || voiceChannel.type !== 'GUILD_VOICE') {
    return interaction.reply({
      content: 'You must be in a voice channel to use this command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if voting is enabled and user can't bypass
  if (
    this.votingService.isEnabled() &&
    member &&
    !this.votingService.canBypass(member)
  ) {
    const voteResult = this.votingService.vote(
      guildId,
      VoteAction.Skip,
      interaction.user.id,
      voiceChannel as VoiceChannel,
    );

    if (voteResult.alreadyVoted) {
      return interaction.reply({
        content: `You've already voted to skip. Need ${voteResult.requiredVotes - voteResult.currentVotes} more vote(s).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!voteResult.passed) {
      const embed = new EmbedBuilder()
        .setTitle('Vote to Skip')
        .setDescription(
          `Skip current track?\n\n` +
            `**Votes:** ${voteResult.currentVotes}/${voteResult.requiredVotes}\n\n` +
            this.votingService.getVotersDisplay(guildId, VoteAction.Skip),
        )
        .setColor(0x5865f2)
        .setFooter({
          text: `Need ${voteResult.requiredVotes - voteResult.currentVotes} more vote(s)`,
        });

      return interaction.reply({ embeds: [embed] });
    }

    // Vote passed - continue with skip
  }

  // Execute skip
  const nextTrack = this.musicService.skip(guildId);

  if (nextTrack) {
    const embed = this.createTrackEmbed(nextTrack, 'Now Playing');
    return interaction.reply({ embeds: [embed] });
  }

  return interaction.reply({
    content: 'Queue is now empty.',
  });
}

// Similar pattern for shuffle, reverse, clear, stop commands
```

---

## 4. Genre Playlists Service

### GenrePlaylistService Implementation

```typescript
// apps/bot/src/discord/music/genre-playlists/genre-playlists.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotConfig } from '../../../config/config.type';

export interface PlaylistTrack {
  service: 'yt' | 'sc' | 'bc' | 'vm' | 'dm';
  id: string;
}

export interface GenreConfig {
  name: string;
  displayName: string;
  color: number;
  iconUrl: string;
  source: string; // URL to JSON or YouTube playlist
}

const DEFAULT_GENRES: Record<string, GenreConfig> = {
  synthwave: {
    name: 'synthwave',
    displayName: 'Synthwave',
    color: 0xdb8ff1,
    iconUrl: 'https://i.imgur.com/synthwave.jpg',
    source: 'https://dissidence.ovh/cyanure/cdn/playable/synthwave.json',
  },
  disco: {
    name: 'disco',
    displayName: 'Disco Night Fever',
    color: 0xa78426,
    iconUrl: 'https://i.imgur.com/disco.jpg',
    source:
      'https://www.youtube.com/playlist?list=PLJO2_VlV2EbIhNj4KsyDfyRYYEbT3-2Jd',
  },
  electro: {
    name: 'electro',
    displayName: 'Electro',
    color: 0x00bcd4,
    iconUrl: 'https://i.imgur.com/electro.jpg',
    source: 'https://dissidence.ovh/cyanure/cdn/playable/electro.json',
  },
};

@Injectable()
export class GenrePlaylistsService implements OnModuleInit {
  private readonly logger = new Logger(GenrePlaylistsService.name);
  private readonly playlists = new Map<string, PlaylistTrack[]>();
  private readonly genres: Record<string, GenreConfig>;

  constructor(private readonly configService: ConfigService<BotConfig>) {
    // Merge default genres with config overrides
    const configGenres =
      this.configService.get('genrePlaylists', { infer: true }) ?? {};

    this.genres = { ...DEFAULT_GENRES };

    // Apply config overrides
    for (const [genre, source] of Object.entries(configGenres)) {
      if (this.genres[genre] && typeof source === 'string') {
        this.genres[genre].source = source;
      }
    }
  }

  public async onModuleInit(): Promise<void> {
    // Pre-fetch playlists for JSON sources
    for (const [name, config] of Object.entries(this.genres)) {
      if (config.source.endsWith('.json')) {
        await this.fetchPlaylist(name, config.source);
      }
    }
  }

  /**
   * Get available genre names
   */
  public getAvailableGenres(): string[] {
    return Object.keys(this.genres);
  }

  /**
   * Get genre configuration
   */
  public getGenreConfig(genre: string): GenreConfig | undefined {
    return this.genres[genre];
  }

  /**
   * Fetch playlist from JSON source
   */
  private async fetchPlaylist(
    genre: string,
    source: string,
  ): Promise<PlaylistTrack[]> {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const tracks = (await response.json()) as PlaylistTrack[];
      this.playlists.set(genre, tracks);
      this.logger.log(`Loaded ${tracks.length} tracks for ${genre}`);
      return tracks;
    } catch (error) {
      this.logger.error(`Failed to fetch ${genre} playlist`, error);
      return [];
    }
  }

  /**
   * Get a random track from a genre playlist
   * @param genre Genre name
   * @returns Random track or null if genre not found
   */
  public async getRandomTrack(genre: string): Promise<PlaylistTrack | null> {
    const config = this.genres[genre];
    if (!config) {
      return null;
    }

    // If source is a YouTube playlist, return the playlist URL
    // The MusicService will handle picking a random track
    if (config.source.includes('youtube.com/playlist')) {
      // Return a special marker for YouTube playlists
      return {
        service: 'yt',
        id: config.source, // Full playlist URL
      };
    }

    // For JSON playlists, get cached or fetch
    let tracks = this.playlists.get(genre);
    if (!tracks || tracks.length === 0) {
      tracks = await this.fetchPlaylist(genre, config.source);
    }

    if (tracks.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * tracks.length);
    return tracks[randomIndex] ?? null;
  }
}
```

### Genre Playlist Commands

```typescript
// apps/bot/src/discord/music/genre-playlists/genre-playlists.commands.ts

import { Injectable, Logger } from '@nestjs/common';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { GenrePlaylistsService } from './genre-playlists.service';
import { MusicService } from '../music.service';
import { VoiceService } from '../voice.service';
import { NowPlayingService } from '../now-playing.service';

@Injectable()
export class GenrePlaylistsCommands {
  private readonly logger = new Logger(GenrePlaylistsCommands.name);

  constructor(
    private readonly genreService: GenrePlaylistsService,
    private readonly musicService: MusicService,
    private readonly voiceService: VoiceService,
    private readonly nowPlayingService: NowPlayingService,
  ) {}

  @SlashCommand({
    name: 'synthwave',
    description: 'Play a random Synthwave track',
  })
  public async synthwave(@Context() [interaction]: SlashCommandContext) {
    return this.playGenre(interaction, 'synthwave');
  }

  @SlashCommand({
    name: 'disco',
    description: 'Play a random Disco track',
  })
  public async disco(@Context() [interaction]: SlashCommandContext) {
    return this.playGenre(interaction, 'disco');
  }

  @SlashCommand({
    name: 'electro',
    description: 'Play a random Electro track',
  })
  public async electro(@Context() [interaction]: SlashCommandContext) {
    return this.playGenre(interaction, 'electro');
  }

  /**
   * Generic handler for genre commands
   */
  private async playGenre(interaction: SlashCommandContext[0], genre: string) {
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

    const config = this.genreService.getGenreConfig(genre);
    if (!config) {
      return interaction.reply({
        content: `Genre **${genre}** not found.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      // Get random track from genre
      const trackData = await this.genreService.getRandomTrack(genre);

      if (!trackData) {
        return interaction.editReply({
          content: `No tracks available for **${config.displayName}**.`,
        });
      }

      // Join voice if needed
      if (!this.voiceService.isConnected(guildId)) {
        await this.voiceService.join(voiceChannel);
      }

      this.nowPlayingService.setChannelForGuild(guildId, interaction.channelId);

      // Resolve track based on service
      let url: string;
      switch (trackData.service) {
        case 'yt':
          url = trackData.id.startsWith('http')
            ? trackData.id
            : `https://www.youtube.com/watch?v=${trackData.id}`;
          break;
        case 'sc':
          url = trackData.id;
          break;
        case 'bc':
          url = trackData.id;
          break;
        case 'vm':
          url = `https://vimeo.com/${trackData.id}`;
          break;
        case 'dm':
          url = `https://www.dailymotion.com/video/${trackData.id}`;
          break;
        default:
          url = trackData.id;
      }

      // Handle YouTube playlist - pick random track
      if (url.includes('youtube.com/playlist')) {
        const track = await this.musicService.playRandomFromPlaylist(
          guildId,
          url,
          interaction.user.tag,
        );

        if (!track) {
          return interaction.editReply({
            content: `Failed to get track from ${config.displayName} playlist.`,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(config.displayName)
          .setDescription(`**${track.title}**`)
          .setThumbnail(track.thumbnail)
          .setColor(config.color)
          .addFields(
            { name: 'Requested by', value: interaction.user.tag, inline: true },
            {
              name: 'Duration',
              value: this.formatDuration(track.duration),
              inline: true,
            },
          )
          .setFooter({ text: `Use /${genre} for more` });

        return interaction.editReply({ embeds: [embed] });
      }

      // Regular track
      const track = await this.musicService.play(
        guildId,
        url,
        interaction.user.tag,
      );

      this.musicService.setupAutoPlay(guildId);

      const embed = new EmbedBuilder()
        .setTitle(config.displayName)
        .setDescription(`**${track.title}**`)
        .setThumbnail(track.thumbnail)
        .setColor(config.color)
        .addFields(
          { name: 'Requested by', value: interaction.user.tag, inline: true },
          {
            name: 'Duration',
            value: this.formatDuration(track.duration),
            inline: true,
          },
        )
        .setFooter({ text: `Use /${genre} for more` });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to play ${genre} track`, error);
      return interaction.editReply({
        content: `Failed to play ${config.displayName} track. Try again.`,
      });
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds === 0) return 'LIVE';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
```

### Genre Playlists Module

```typescript
// apps/bot/src/discord/music/genre-playlists/genre-playlists.module.ts

import { Module } from '@nestjs/common';
import { GenrePlaylistsService } from './genre-playlists.service';
import { GenrePlaylistsCommands } from './genre-playlists.commands';

@Module({
  providers: [GenrePlaylistsService, GenrePlaylistsCommands],
  exports: [GenrePlaylistsService],
})
export class GenrePlaylistsModule {}
```

---

## 5. Autodisplay Feature

### Autodisplay State Management

```typescript
// apps/bot/src/discord/music/music.service.ts (additions)

// Add to MusicService class
private readonly autodisplayEnabled = new Map<string, boolean>();

/**
 * Toggle autodisplay for a guild
 * @returns New autodisplay state
 */
public toggleAutodisplay(guildId: string): boolean {
  const current = this.autodisplayEnabled.get(guildId) ?? false;
  const newState = !current;
  this.autodisplayEnabled.set(guildId, newState);
  return newState;
}

/**
 * Check if autodisplay is enabled for a guild
 */
public isAutodisplayEnabled(guildId: string): boolean {
  return this.autodisplayEnabled.get(guildId) ?? false;
}
```

### Autodisplay Command

```typescript
// apps/bot/src/discord/music/music.commands.ts (additions)

@SlashCommand({
  name: 'autodisplay',
  description: 'Toggle automatic now playing messages',
})
public async autodisplay(@Context() [interaction]: SlashCommandContext) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check for staff permissions
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  if (!member?.permissions.has(PermissionFlagsBits.KickMembers)) {
    return interaction.reply({
      content: 'You need staff permissions to toggle autodisplay.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const newState = this.musicService.toggleAutodisplay(guildId);

  const embed = new EmbedBuilder()
    .setTitle('Autodisplay')
    .setDescription(
      newState
        ? 'Automatic now playing display: **enabled**'
        : 'Automatic now playing display: **disabled**',
    )
    .setColor(newState ? 0x00c853 : 0xff5252);

  return interaction.reply({ embeds: [embed] });
}
```

### Update NowPlayingService for Autodisplay

```typescript
// apps/bot/src/discord/music/now-playing.service.ts (update)

// In the method that handles track start events:
public async onTrackStart(guildId: string, track: Track): Promise<void> {
  // Only auto-display if enabled
  if (!this.musicService.isAutodisplayEnabled(guildId)) {
    return;
  }

  const channelId = this.channelMap.get(guildId);
  if (!channelId) {
    return;
  }

  await this.sendNowPlaying(guildId);
}
```

---

## Config Schema Updates

```typescript
// apps/bot/src/config/config.type.ts (additions)

export const configSchema = type.module({
  json: {
    // ... existing fields

    'genius?': {
      apiKey: 'string',
    },

    'radio?': {
      stationsUrl: 'string', // default: https://radios.music-hub.fr/radios/all.json
    },

    'voting?': {
      enabled: 'boolean', // default: true
      thresholdPercent: 'number', // default: 50
      minVoters: 'number', // default: 2
    },

    'genrePlaylists?': {
      synthwave: 'string', // JSON URL override
      disco: 'string', // YouTube playlist URL override
      electro: 'string',
    },
  },
});
```

Update `config.example.json`:

```json
{
  "discord": {
    "token": "YOUR_DISCORD_BOT_TOKEN",
    "guildIds": ["YOUR_GUILD_ID"]
  },
  "genius": {
    "apiKey": "YOUR_GENIUS_API_KEY"
  },
  "radio": {
    "stationsUrl": "https://radios.music-hub.fr/radios/all.json"
  },
  "voting": {
    "enabled": true,
    "thresholdPercent": 50,
    "minVoters": 2
  },
  "genrePlaylists": {
    "synthwave": "https://dissidence.ovh/cyanure/cdn/playable/synthwave.json",
    "disco": "https://www.youtube.com/playlist?list=PLJO2_VlV2EbIhNj4KsyDfyRYYEbT3-2Jd",
    "electro": "https://dissidence.ovh/cyanure/cdn/playable/electro.json"
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// apps/bot/src/discord/music/lyrics/lyrics.service.spec.ts

describe('LyricsService', () => {
  let service: LyricsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LyricsService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('fake-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get(LyricsService);
    service.onModuleInit();
  });

  describe('cleanSearchQuery', () => {
    it('should remove content in parentheses', () => {
      expect(service['cleanSearchQuery']('Song (Official Video)')).toBe('Song');
    });

    it('should remove content in brackets', () => {
      expect(service['cleanSearchQuery']('Song [Lyrics]')).toBe('Song');
    });

    it('should remove common suffixes', () => {
      expect(service['cleanSearchQuery']('Song Official Audio HD')).toBe(
        'Song',
      );
    });
  });

  describe('splitLyrics', () => {
    it('should return single chunk for short lyrics', () => {
      const lyrics = 'Short lyrics';
      expect(service.splitLyrics(lyrics)).toHaveLength(1);
    });

    it('should split long lyrics into multiple chunks', () => {
      const lyrics = 'Paragraph 1\n\n'.repeat(100);
      const chunks = service.splitLyrics(lyrics, 500);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});

// apps/bot/src/discord/music/radio/radio.service.spec.ts

describe('RadioService', () => {
  let service: RadioService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RadioService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(RadioService);
  });

  describe('search', () => {
    it('should return matching stations', async () => {
      // Mock fetch
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          { title: 'NRJ France', flux: 'http://stream.nrj.fr' },
          { title: 'RTL 2', flux: 'http://stream.rtl2.fr' },
          { title: 'Fun Radio', flux: 'http://stream.funradio.fr' },
        ]),
      } as unknown as Response);

      const result = await service.search('NRJ');

      expect(result.stations).toHaveLength(1);
      expect(result.stations[0].title).toBe('NRJ France');
    });

    it('should limit results', async () => {
      const manyStations = Array.from({ length: 50 }, (_, i) => ({
        title: `Station ${i}`,
        flux: `http://stream${i}.com`,
      }));

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(manyStations),
      } as unknown as Response);

      const result = await service.search('Station', 5);

      expect(result.stations).toHaveLength(5);
      expect(result.totalMatches).toBe(50);
    });
  });
});

// apps/bot/src/discord/music/voting/voting.service.spec.ts

describe('VotingService', () => {
  let service: VotingService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        VotingService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              const config: Record<string, unknown> = {
                'voting.enabled': true,
                'voting.thresholdPercent': 50,
                'voting.minVoters': 2,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get(VotingService);
  });

  describe('calculateRequiredVotes', () => {
    it('should calculate majority threshold', () => {
      const mockChannel = {
        members: {
          filter: vi.fn().mockReturnValue({ size: 4 }),
        },
      } as unknown as VoiceChannel;

      const required = service.calculateRequiredVotes(mockChannel);

      expect(required).toBe(2); // 50% of 4 = 2
    });

    it('should use minimum voters if higher', () => {
      const mockChannel = {
        members: {
          filter: vi.fn().mockReturnValue({ size: 2 }),
        },
      } as unknown as VoiceChannel;

      const required = service.calculateRequiredVotes(mockChannel);

      expect(required).toBe(2); // minVoters = 2
    });
  });

  describe('vote', () => {
    it('should register first vote', () => {
      const mockChannel = {
        members: {
          filter: vi.fn().mockReturnValue({ size: 4 }),
        },
      } as unknown as VoiceChannel;

      const result = service.vote(
        'guild1',
        VoteAction.Skip,
        'user1',
        mockChannel,
      );

      expect(result.success).toBe(true);
      expect(result.currentVotes).toBe(1);
      expect(result.passed).toBe(false);
    });

    it('should reject duplicate votes', () => {
      const mockChannel = {
        members: {
          filter: vi.fn().mockReturnValue({ size: 4 }),
        },
      } as unknown as VoiceChannel;

      service.vote('guild1', VoteAction.Skip, 'user1', mockChannel);
      const result = service.vote(
        'guild1',
        VoteAction.Skip,
        'user1',
        mockChannel,
      );

      expect(result.success).toBe(false);
      expect(result.alreadyVoted).toBe(true);
    });

    it('should pass when threshold reached', () => {
      const mockChannel = {
        members: {
          filter: vi.fn().mockReturnValue({ size: 4 }),
        },
      } as unknown as VoiceChannel;

      service.vote('guild1', VoteAction.Skip, 'user1', mockChannel);
      const result = service.vote(
        'guild1',
        VoteAction.Skip,
        'user2',
        mockChannel,
      );

      expect(result.passed).toBe(true);
    });
  });
});
```

---

## Checklist

### Files to Create

- [ ] `apps/bot/src/discord/music/lyrics/lyrics.module.ts`
- [ ] `apps/bot/src/discord/music/lyrics/lyrics.service.ts`
- [ ] `apps/bot/src/discord/music/lyrics/lyrics.commands.ts`
- [ ] `apps/bot/src/discord/music/lyrics/lyrics.service.spec.ts`

- [ ] `apps/bot/src/discord/music/radio/radio.module.ts`
- [ ] `apps/bot/src/discord/music/radio/radio.service.ts`
- [ ] `apps/bot/src/discord/music/radio/radio.commands.ts`
- [ ] `apps/bot/src/discord/music/radio/radio.types.ts`
- [ ] `apps/bot/src/discord/music/radio/radio.service.spec.ts`

- [ ] `apps/bot/src/discord/music/voting/voting.module.ts`
- [ ] `apps/bot/src/discord/music/voting/voting.service.ts`
- [ ] `apps/bot/src/discord/music/voting/voting.types.ts`
- [ ] `apps/bot/src/discord/music/voting/voting.service.spec.ts`

- [ ] `apps/bot/src/discord/music/genre-playlists/genre-playlists.module.ts`
- [ ] `apps/bot/src/discord/music/genre-playlists/genre-playlists.service.ts`
- [ ] `apps/bot/src/discord/music/genre-playlists/genre-playlists.commands.ts`

### Files to Modify

- [ ] `apps/bot/src/discord/music/music.module.ts`
  - [ ] Import LyricsModule
  - [ ] Import RadioModule
  - [ ] Import VotingModule
  - [ ] Import GenrePlaylistsModule

- [ ] `apps/bot/src/discord/music/music.service.ts`
  - [ ] Add autodisplay state management
  - [ ] Add `toggleAutodisplay()` method
  - [ ] Add `isAutodisplayEnabled()` method
  - [ ] Add `playRandomFromPlaylist()` method

- [ ] `apps/bot/src/discord/music/music.commands.ts`
  - [ ] Add `/autodisplay` command
  - [ ] Integrate VotingService with skip, shuffle, reverse, clear, stop

- [ ] `apps/bot/src/discord/music/now-playing.service.ts`
  - [ ] Add autodisplay check in track start handler

- [ ] `apps/bot/src/config/config.type.ts`
  - [ ] Add genius config schema
  - [ ] Add radio config schema
  - [ ] Add voting config schema
  - [ ] Add genrePlaylists config schema

- [ ] `apps/bot/config.example.json`
  - [ ] Add genius API key placeholder
  - [ ] Add radio config
  - [ ] Add voting config
  - [ ] Add genrePlaylists config

### Estimated Effort

| Task            | Complexity | Time            |
| --------------- | ---------- | --------------- |
| Lyrics service  | M          | 3-4 hours       |
| Radio service   | M          | 3-4 hours       |
| Voting service  | M          | 3-4 hours       |
| Genre playlists | S          | 2-3 hours       |
| Autodisplay     | S          | 1-2 hours       |
| Config updates  | S          | 1 hour          |
| Tests           | M          | 3-4 hours       |
| **Total**       |            | **16-22 hours** |

---

## Summary

Phase 3 adds the following features:

1. **Lyrics** (`/lyrics [query]`)
   - Genius API integration
   - Auto-fetch for current track
   - Split long lyrics across embeds

2. **Radio** (`/radio <query>`)
   - 2500+ French stations
   - Interactive select menu
   - Cached station list

3. **Voting** (integrated with existing commands)
   - Majority vote for skip, shuffle, reverse, clear, stop
   - Staff bypass with `KICK_MEMBERS` permission
   - Vote tracking per action

4. **Genre Playlists** (`/synthwave`, `/disco`, `/electro`)
   - Random track from curated playlists
   - JSON and YouTube playlist sources
   - Configurable playlist URLs

5. **Autodisplay** (`/autodisplay`)
   - Staff-only toggle
   - Auto-post now playing on track change
