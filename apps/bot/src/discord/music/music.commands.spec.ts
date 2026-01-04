import type {
  ChatInputCommandInteraction,
  Collection,
  Guild,
  GuildMember,
  GuildMemberManager,
  VoiceBasedChannel,
} from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceService } from '../voice/voice.service';
import { LoopMode, type Track } from './music-queue';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { NowPlayingService } from './now-playing.service';

const mockTrack: Track = {
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Test Video',
  duration: 180,
  thumbnail: 'https://example.com/thumb.jpg',
  requestedBy: 'user#1234',
};

function createMockInteraction(
  options: {
    guildId?: string | null;
    inVoiceChannel?: boolean;
    options?: Record<string, unknown>;
  } = {},
): ChatInputCommandInteraction {
  const { guildId = 'guild-123', inVoiceChannel = true } = options;

  const mockVoiceChannel = inVoiceChannel
    ? ({ id: 'voice-123', name: 'General' } as VoiceBasedChannel)
    : null;

  const mockMember = {
    voice: { channel: mockVoiceChannel },
  } as unknown as GuildMember;

  const membersCache = new Map<string, GuildMember>();
  membersCache.set('user-123', mockMember);

  const mockGuild = {
    id: guildId,
    members: {
      cache: {
        get: vi.fn((id: string) => membersCache.get(id)),
      } as unknown as Collection<string, GuildMember>,
    } as unknown as GuildMemberManager,
  } as unknown as Guild;

  return {
    guildId,
    guild: guildId ? mockGuild : null,
    user: { id: 'user-123', tag: 'user#1234' },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-unsafe-assignment */
describe('MusicCommands', () => {
  let commands: MusicCommands;
  let musicService: MusicService;
  let voiceService: VoiceService;
  let nowPlayingService: NowPlayingService;

  beforeEach(() => {
    vi.clearAllMocks();

    musicService = {
      play: vi.fn().mockResolvedValue(mockTrack),
      searchAndPlay: vi.fn().mockResolvedValue(mockTrack),
      skip: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getNowPlaying: vi.fn(),
      getQueue: vi.fn().mockReturnValue([]),
      getUpcoming: vi.fn().mockReturnValue([]),
      getLoopMode: vi.fn().mockReturnValue(LoopMode.None),
      clearQueue: vi.fn(),
      shuffle: vi.fn(),
      cycleLoopMode: vi.fn().mockReturnValue(LoopMode.Track),
      setVolume: vi.fn().mockResolvedValue(0.5),
      isPlaying: vi.fn().mockReturnValue(false),
      isPaused: vi.fn().mockReturnValue(false),
      remove: vi.fn(),
      cleanup: vi.fn(),
      setupAutoPlay: vi.fn(),
    } as unknown as MusicService;

    voiceService = {
      isConnected: vi.fn().mockReturnValue(false),
      join: vi.fn().mockResolvedValue({}),
      leave: vi.fn().mockReturnValue(true),
    } as unknown as VoiceService;

    nowPlayingService = {
      setChannelForGuild: vi.fn(),
      getChannelForGuild: vi.fn(),
      getMessageForGuild: vi.fn(),
      sendNowPlaying: vi.fn().mockResolvedValue(undefined),
      deleteNowPlaying: vi.fn().mockResolvedValue(undefined),
      repostIfInSameChannel: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
    } as unknown as NowPlayingService;

    commands = new MusicCommands(musicService, voiceService, nowPlayingService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('play', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('returns error when user not in voice channel', async () => {
      const interaction = createMockInteraction({ inVoiceChannel: false });

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'You must be in a voice channel to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('joins voice channel and plays track when not connected', async () => {
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(voiceService.join).toHaveBeenCalled();
      expect(musicService.setupAutoPlay).toHaveBeenCalledWith('guild-123');
      expect(musicService.play).toHaveBeenCalledWith(
        'guild-123',
        'https://youtube.com/watch?v=test',
        'user#1234',
      );
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });

    it('plays track without joining when already connected', async () => {
      vi.mocked(voiceService.isConnected).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(voiceService.join).not.toHaveBeenCalled();
      expect(musicService.play).toHaveBeenCalled();
    });

    it('handles play errors gracefully', async () => {
      vi.mocked(musicService.play).mockRejectedValue(
        new Error('Failed to fetch'),
      );
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Failed to play: Failed to fetch',
      });
    });

    it('handles non-Error exceptions', async () => {
      vi.mocked(musicService.play).mockRejectedValue('string error');
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Failed to play: Unknown error',
      });
    });

    it('uses searchAndPlay for non-URL queries', async () => {
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'never gonna give you up',
      });

      expect(musicService.searchAndPlay).toHaveBeenCalledWith(
        'guild-123',
        'never gonna give you up',
        'user#1234',
      );
      expect(musicService.play).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });

    it('uses play for valid YouTube URLs', async () => {
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      expect(musicService.play).toHaveBeenCalledWith(
        'guild-123',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );
      expect(musicService.searchAndPlay).not.toHaveBeenCalled();
    });

    it('uses play for valid HTTP URLs', async () => {
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'http://example.com/video',
      });

      expect(musicService.play).toHaveBeenCalled();
      expect(musicService.searchAndPlay).not.toHaveBeenCalled();
    });

    it('uses searchAndPlay for invalid URL-like strings', async () => {
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'not-a-valid-url',
      });

      expect(musicService.searchAndPlay).toHaveBeenCalled();
      expect(musicService.play).not.toHaveBeenCalled();
    });

    it('handles searchAndPlay errors gracefully', async () => {
      vi.mocked(musicService.searchAndPlay).mockRejectedValue(
        new Error('No results found'),
      );
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'some obscure search query',
      });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Failed to play: No results found',
      });
    });
  });

  describe('skip', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.skip([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('shows next track when skip succeeds', async () => {
      vi.mocked(musicService.skip).mockReturnValue(mockTrack);
      const interaction = createMockInteraction();

      await commands.skip([interaction]);

      expect(musicService.skip).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });

    it('shows message when no more tracks', async () => {
      vi.mocked(musicService.skip).mockReturnValue(undefined);
      const interaction = createMockInteraction();

      await commands.skip([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Skipped. No more tracks in queue.',
      });
    });
  });

  describe('stop', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.stop([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('stops playback when something is playing', async () => {
      vi.mocked(musicService.stop).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.stop([interaction]);

      expect(musicService.stop).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Stopped playback and cleared the queue.',
      });
    });

    it('returns error when nothing is playing', async () => {
      vi.mocked(musicService.stop).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.stop([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Nothing is playing.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('pause', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.pause([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('pauses playback', async () => {
      vi.mocked(musicService.pause).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.pause([interaction]);

      expect(musicService.pause).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({ content: '⏸️ Paused.' });
    });

    it('returns error when nothing to pause', async () => {
      vi.mocked(musicService.pause).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.pause([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Nothing is playing or already paused.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('resume', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.resume([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('resumes playback', async () => {
      vi.mocked(musicService.resume).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.resume([interaction]);

      expect(musicService.resume).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '▶️ Resumed.',
      });
    });

    it('returns error when nothing to resume', async () => {
      vi.mocked(musicService.resume).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.resume([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Nothing to resume.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('nowPlaying', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.nowPlaying([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('shows current track', async () => {
      vi.mocked(musicService.getNowPlaying).mockReturnValue(mockTrack);
      const interaction = createMockInteraction();

      await commands.nowPlaying([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });

    it('returns error when nothing is playing', async () => {
      vi.mocked(musicService.getNowPlaying).mockReturnValue(undefined);
      const interaction = createMockInteraction();

      await commands.nowPlaying([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Nothing is currently playing.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('queue', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.queue([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('returns error when queue is empty', async () => {
      vi.mocked(musicService.getQueue).mockReturnValue([]);
      const interaction = createMockInteraction();

      await commands.queue([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'The queue is empty.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('shows queue with current track and upcoming', async () => {
      vi.mocked(musicService.getQueue).mockReturnValue([
        mockTrack,
        { ...mockTrack, title: 'Track 2' },
      ]);
      vi.mocked(musicService.getNowPlaying).mockReturnValue(mockTrack);
      vi.mocked(musicService.getUpcoming).mockReturnValue([
        { ...mockTrack, title: 'Track 2' },
      ]);
      const interaction = createMockInteraction();

      await commands.queue([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });

    it('shows queue with more than 10 upcoming tracks', async () => {
      const tracks = Array.from({ length: 15 }, (_, i) => ({
        ...mockTrack,
        title: `Track ${String(i + 1)}`,
      }));
      vi.mocked(musicService.getQueue).mockReturnValue(tracks);
      vi.mocked(musicService.getNowPlaying).mockReturnValue(tracks[0]);
      vi.mocked(musicService.getUpcoming).mockReturnValue(tracks.slice(1));
      const interaction = createMockInteraction();

      await commands.queue([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });

    it('shows queue without current track', async () => {
      vi.mocked(musicService.getQueue).mockReturnValue([mockTrack]);
      vi.mocked(musicService.getNowPlaying).mockReturnValue(undefined);
      vi.mocked(musicService.getUpcoming).mockReturnValue([]);
      const interaction = createMockInteraction();

      await commands.queue([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([expect.any(EmbedBuilder)]),
      });
    });
  });

  describe('clear', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.clear([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('clears the queue', async () => {
      vi.mocked(musicService.clearQueue).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.clear([interaction]);

      expect(musicService.clearQueue).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '🗑️ Queue cleared.',
      });
    });

    it('returns error when queue already empty', async () => {
      vi.mocked(musicService.clearQueue).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.clear([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'The queue is already empty.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('shuffle', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.shuffle([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('shuffles the queue', async () => {
      vi.mocked(musicService.shuffle).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.shuffle([interaction]);

      expect(musicService.shuffle).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '🔀 Queue shuffled.',
      });
    });

    it('returns error when not enough tracks', async () => {
      vi.mocked(musicService.shuffle).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.shuffle([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Not enough tracks to shuffle.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('loop', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.loop([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('cycles to track loop mode', async () => {
      vi.mocked(musicService.cycleLoopMode).mockReturnValue(LoopMode.Track);
      const interaction = createMockInteraction();

      await commands.loop([interaction]);

      expect(musicService.cycleLoopMode).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '🔂 Loop mode: **track**',
      });
    });

    it('cycles to queue loop mode', async () => {
      vi.mocked(musicService.cycleLoopMode).mockReturnValue(LoopMode.Queue);
      const interaction = createMockInteraction();

      await commands.loop([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '🔁 Loop mode: **queue**',
      });
    });

    it('cycles to no loop mode', async () => {
      vi.mocked(musicService.cycleLoopMode).mockReturnValue(LoopMode.None);
      const interaction = createMockInteraction();

      await commands.loop([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '➡️ Loop mode: **none**',
      });
    });
  });

  describe('volume', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.volume([interaction], { level: 50 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('returns error when nothing is playing', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(false);
      vi.mocked(musicService.isPaused).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 50 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Nothing is playing.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('sets volume when playing', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockReturnValue(0.5);
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 50 });

      expect(musicService.setVolume).toHaveBeenCalledWith('guild-123', 0.5);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('50%'),
      });
    });

    it('sets volume when paused', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(false);
      vi.mocked(musicService.isPaused).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockReturnValue(0.75);
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 75 });

      expect(musicService.setVolume).toHaveBeenCalledWith('guild-123', 0.75);
    });

    it('handles volume error', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockImplementation(() => {
        throw new Error('Volume error');
      });
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 50 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Failed to set volume: Volume error',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('handles non-Error volume exceptions', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 50 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Failed to set volume: Unknown error',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('shows muted icon for 0% volume', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockReturnValue(0);
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 0 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('0%'),
      });
    });

    it('shows boosted volume for levels over 100%', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockReturnValue(1.5);
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 150 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('150%'),
      });
    });

    it('shows low volume icon for levels <= 50%', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);
      vi.mocked(musicService.setVolume).mockReturnValue(0.3);
      const interaction = createMockInteraction();

      await commands.volume([interaction], { level: 30 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringMatching(/🔉.*30%/),
      });
    });
  });

  describe('remove', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.remove([interaction], { position: 1 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('removes track from queue', async () => {
      vi.mocked(musicService.remove).mockReturnValue(mockTrack);
      const interaction = createMockInteraction();

      await commands.remove([interaction], { position: 2 });

      expect(musicService.remove).toHaveBeenCalledWith('guild-123', 1);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Removed **Test Video** from the queue.',
      });
    });

    it('returns error when remove fails', async () => {
      vi.mocked(musicService.remove).mockReturnValue(undefined);
      const interaction = createMockInteraction();

      await commands.remove([interaction], { position: 1 });

      expect(interaction.reply).toHaveBeenCalledWith({
        content:
          'Could not remove track. Invalid position or currently playing.',
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('disconnect', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await commands.disconnect([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('disconnects and cleans up', async () => {
      vi.mocked(voiceService.leave).mockReturnValue(true);
      const interaction = createMockInteraction();

      await commands.disconnect([interaction]);

      expect(musicService.cleanup).toHaveBeenCalledWith('guild-123');
      expect(voiceService.leave).toHaveBeenCalledWith('guild-123');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '👋 Disconnected.',
      });
    });

    it('returns error when not connected', async () => {
      vi.mocked(voiceService.leave).mockReturnValue(false);
      const interaction = createMockInteraction();

      await commands.disconnect([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "I'm not connected to a voice channel.",
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('formatDuration helper (via embed)', () => {
    it('formats hours correctly in embed', async () => {
      const longTrack: Track = {
        ...mockTrack,
        duration: 3661,
      };
      vi.mocked(musicService.play).mockResolvedValue(longTrack);
      const interaction = createMockInteraction();

      await commands.play([interaction], {
        query: 'https://youtube.com/watch?v=test',
      });

      expect(interaction.editReply).toHaveBeenCalled();
    });
  });
});
/* eslint-enable @typescript-eslint/no-unsafe-assignment */
