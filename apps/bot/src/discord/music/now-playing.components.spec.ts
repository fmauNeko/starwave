/* eslint-disable @typescript-eslint/no-deprecated */
import type { ButtonInteraction, GuildMember, VoiceChannel } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopMode, Track } from './music-queue';
import { MusicService } from './music.service';
import { NowPlayingComponents } from './now-playing.components';
import { NowPlayingService } from './now-playing.service';

const mockTrack: Track = {
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Test Video',
  duration: 180,
  thumbnail: 'https://example.com/thumb.jpg',
  requestedBy: 'user#1234',
};

describe('NowPlayingComponents', () => {
  let components: NowPlayingComponents;
  let musicService: MusicService;
  let nowPlayingService: NowPlayingService;
  let mockInteraction: ButtonInteraction;
  let mockVoiceChannel: VoiceChannel;
  let mockMember: GuildMember;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVoiceChannel = {
      id: 'voice-123',
      type: 2,
    } as unknown as VoiceChannel;

    mockMember = {
      voice: {
        channel: mockVoiceChannel,
      },
    } as unknown as GuildMember;

    mockInteraction = {
      guildId: 'guild-123',
      channelId: 'channel-123',
      user: { id: 'user-123', tag: 'user#1234' },
      guild: {
        members: {
          cache: {
            get: vi.fn().mockReturnValue(mockMember),
          },
        },
      },
      inGuild: vi.fn().mockReturnValue(true),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
    } as unknown as ButtonInteraction;

    musicService = {
      getNowPlaying: vi.fn().mockReturnValue(mockTrack),
      pause: vi.fn().mockReturnValue(true),
      resume: vi.fn().mockReturnValue(true),
      skip: vi.fn().mockReturnValue(mockTrack),
      stop: vi.fn().mockReturnValue(true),
      shuffle: vi.fn().mockReturnValue(true),
      cycleLoopMode: vi.fn().mockReturnValue('track' as LoopMode),
      isPlaying: vi.fn().mockReturnValue(true),
      isPaused: vi.fn().mockReturnValue(false),
    } as unknown as MusicService;

    nowPlayingService = {
      sendNowPlaying: vi.fn().mockResolvedValue(undefined),
      deleteNowPlaying: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
    } as unknown as NowPlayingService;

    components = new NowPlayingComponents(musicService, nowPlayingService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onPlayPauseButton', () => {
    it('pauses playback when currently playing', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(true);

      await components.onPlayPauseButton([mockInteraction]);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(musicService.pause).toHaveBeenCalledWith('guild-123');
      expect(nowPlayingService.sendNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('resumes playback when currently paused', async () => {
      vi.mocked(musicService.isPlaying).mockReturnValue(false);
      vi.mocked(musicService.isPaused).mockReturnValue(true);

      await components.onPlayPauseButton([mockInteraction]);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(musicService.resume).toHaveBeenCalledWith('guild-123');
      expect(nowPlayingService.sendNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('does nothing when not in guild', async () => {
      vi.mocked(mockInteraction.inGuild).mockReturnValue(false);

      await components.onPlayPauseButton([mockInteraction]);

      expect(musicService.pause).not.toHaveBeenCalled();
      expect(musicService.resume).not.toHaveBeenCalled();
    });

    it('does nothing when user not in voice channel', async () => {
      const memberNotInVoice = {
        voice: {
          channel: null,
        },
      } as unknown as GuildMember;
      const guild = mockInteraction.guild;
      if (guild) {
        vi.mocked(guild.members.cache.get).mockReturnValue(memberNotInVoice);
      }

      await components.onPlayPauseButton([mockInteraction]);

      expect(musicService.pause).not.toHaveBeenCalled();
      expect(musicService.resume).not.toHaveBeenCalled();
    });
  });

  describe('onSkipButton', () => {
    it('skips to next track', async () => {
      await components.onSkipButton([mockInteraction]);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(musicService.skip).toHaveBeenCalledWith('guild-123');
      expect(nowPlayingService.sendNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('cleans up when no more tracks', async () => {
      vi.mocked(musicService.skip).mockReturnValue(undefined);

      await components.onSkipButton([mockInteraction]);

      expect(nowPlayingService.deleteNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('does nothing when not in guild', async () => {
      vi.mocked(mockInteraction.inGuild).mockReturnValue(false);

      await components.onSkipButton([mockInteraction]);

      expect(musicService.skip).not.toHaveBeenCalled();
    });
  });

  describe('onStopButton', () => {
    it('stops playback and cleans up', async () => {
      await components.onStopButton([mockInteraction]);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(musicService.stop).toHaveBeenCalledWith('guild-123');
      expect(nowPlayingService.deleteNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('does nothing when not in guild', async () => {
      vi.mocked(mockInteraction.inGuild).mockReturnValue(false);

      await components.onStopButton([mockInteraction]);

      expect(musicService.stop).not.toHaveBeenCalled();
    });
  });

  describe('onShuffleButton', () => {
    it('shuffles the queue', async () => {
      await components.onShuffleButton([mockInteraction]);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(musicService.shuffle).toHaveBeenCalledWith('guild-123');
      expect(nowPlayingService.sendNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('shows ephemeral follow-up when shuffle fails', async () => {
      vi.mocked(musicService.shuffle).mockReturnValue(false);
      vi.mocked(mockInteraction.followUp).mockResolvedValue(undefined as never);

      await components.onShuffleButton([mockInteraction]);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: expect.stringContaining('shuffle') as string,
        flags: MessageFlags.Ephemeral,
      });
    });

    it('does nothing when not in guild', async () => {
      vi.mocked(mockInteraction.inGuild).mockReturnValue(false);

      await components.onShuffleButton([mockInteraction]);

      expect(musicService.shuffle).not.toHaveBeenCalled();
    });
  });

  describe('onLoopButton', () => {
    it('cycles loop mode', async () => {
      await components.onLoopButton([mockInteraction]);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(musicService.cycleLoopMode).toHaveBeenCalledWith('guild-123');
      expect(nowPlayingService.sendNowPlaying).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('does nothing when not in guild', async () => {
      vi.mocked(mockInteraction.inGuild).mockReturnValue(false);

      await components.onLoopButton([mockInteraction]);

      expect(musicService.cycleLoopMode).not.toHaveBeenCalled();
    });
  });
});
/* eslint-enable @typescript-eslint/no-deprecated */
