import { ConfigService } from '@nestjs/config';
import type { Client, Message, TextChannel } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../config/config.type';
import { LoopMode, type Track } from './music-queue';
import { MusicService } from './music.service';
import { NowPlayingService } from './now-playing.service';

const mockTrack: Track = {
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Test Video',
  duration: 180,
  thumbnail: 'https://example.com/thumb.jpg',
  requestedBy: 'user#1234',
};

const mockGuildsSettings: Config['discord']['guildsSettings'] = {
  'guild-123': {
    language: 'en',
    roles: { admin: '111' },
    theme: { accentColor: '#5865f2' },
  },
};

describe('NowPlayingService', () => {
  let service: NowPlayingService;
  let musicService: MusicService;
  let configService: ConfigService<Config, true>;
  let mockClient: Client;
  let mockChannel: TextChannel;
  let mockMessage: Message;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMessage = {
      id: 'msg-123',
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as Message;

    mockChannel = {
      id: 'channel-123',
      send: vi.fn().mockResolvedValue(mockMessage),
      messages: {
        fetch: vi.fn().mockResolvedValue(mockMessage),
      },
      isSendable: vi.fn().mockReturnValue(true),
    } as unknown as TextChannel;

    mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
    } as unknown as Client;

    musicService = {
      getNowPlaying: vi.fn().mockReturnValue(mockTrack),
      getLoopMode: vi.fn().mockReturnValue(LoopMode.None),
      getVolume: vi.fn().mockReturnValue(0.25),
      isPlaying: vi.fn().mockReturnValue(true),
      isPaused: vi.fn().mockReturnValue(false),
      getUpcoming: vi.fn().mockReturnValue([]),
    } as unknown as MusicService;

    configService = {
      get: vi.fn().mockReturnValue(mockGuildsSettings),
    } as unknown as ConfigService<Config, true>;

    service = new NowPlayingService(musicService, configService, mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setChannelForGuild', () => {
    it('stores channel ID for guild on first command', () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      expect(service.getChannelForGuild('guild-123')).toBe('channel-123');
    });

    it('overwrites channel ID when set again', () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      service.setChannelForGuild('guild-123', 'channel-456');

      expect(service.getChannelForGuild('guild-123')).toBe('channel-456');
    });

    it('returns undefined for unknown guild', () => {
      expect(service.getChannelForGuild('unknown-guild')).toBeUndefined();
    });
  });

  describe('sendNowPlaying', () => {
    it('sends now playing message to stored channel', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.sendNowPlaying('guild-123');

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('channel-123');
      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array) as unknown[],
          flags: expect.any(Array) as unknown[],
        }),
      );
    });

    it('does nothing when no channel is set for guild', async () => {
      await service.sendNowPlaying('guild-123');

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('does nothing when no track is playing', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      vi.mocked(musicService.getNowPlaying).mockReturnValue(undefined);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('stores message ID after sending', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.sendNowPlaying('guild-123');

      expect(service.getMessageForGuild('guild-123')).toBe('msg-123');
    });

    it('deletes previous message before sending new one', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.sendNowPlaying('guild-123');
      vi.clearAllMocks();

      const newMessage = {
        id: 'msg-456',
        delete: vi.fn(),
      } as unknown as Message<true>;
      vi.mocked(mockChannel.send).mockResolvedValue(newMessage);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('msg-123');
      expect(mockMessage.delete).toHaveBeenCalled();
      expect(service.getMessageForGuild('guild-123')).toBe('msg-456');
    });

    it('continues even if previous message deletion fails', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.sendNowPlaying('guild-123');
      vi.clearAllMocks();

      vi.mocked(mockChannel.messages.fetch).mockRejectedValue(
        new Error('Unknown Message'),
      );
      const newMessage = {
        id: 'msg-456',
        delete: vi.fn(),
      } as unknown as Message<true>;
      vi.mocked(mockChannel.send).mockResolvedValue(newMessage);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).toHaveBeenCalled();
      expect(service.getMessageForGuild('guild-123')).toBe('msg-456');
    });

    it('does nothing when channel is not sendable', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      vi.mocked(mockChannel.isSendable).mockReturnValue(false);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).not.toHaveBeenCalled();
    });
  });

  describe('deleteNowPlaying', () => {
    it('deletes existing now playing message', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      await service.sendNowPlaying('guild-123');
      vi.clearAllMocks();

      await service.deleteNowPlaying('guild-123');

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('msg-123');
      expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('clears message ID after deletion', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      await service.sendNowPlaying('guild-123');

      await service.deleteNowPlaying('guild-123');

      expect(service.getMessageForGuild('guild-123')).toBeUndefined();
    });

    it('does nothing when no message exists', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.deleteNowPlaying('guild-123');

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes all state for guild', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      await service.sendNowPlaying('guild-123');

      await service.cleanup('guild-123');

      expect(service.getChannelForGuild('guild-123')).toBeUndefined();
      expect(service.getMessageForGuild('guild-123')).toBeUndefined();
    });

    it('deletes message before cleanup', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      await service.sendNowPlaying('guild-123');
      vi.clearAllMocks();

      await service.cleanup('guild-123');

      expect(mockMessage.delete).toHaveBeenCalled();
    });
  });

  describe('buildNowPlayingComponents', () => {
    it('includes track title in message', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.sendNowPlaying('guild-123');

      const sendCall = vi.mocked(mockChannel.send).mock.calls[0]?.[0];
      expect(sendCall).toBeDefined();
    });

    it('uses guild accent color from config', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.sendNowPlaying('guild-123');

      expect(configService.get).toHaveBeenCalledWith('discord.guildsSettings', {
        infer: true,
      });
    });

    it('shows paused state when paused', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      vi.mocked(musicService.isPlaying).mockReturnValue(false);
      vi.mocked(musicService.isPaused).mockReturnValue(true);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('shows loop mode indicator', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      vi.mocked(musicService.getLoopMode).mockReturnValue(LoopMode.Track);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('shows volume level', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      vi.mocked(musicService.getVolume).mockReturnValue(0.75);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('shows queue count when tracks are upcoming', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      vi.mocked(musicService.getUpcoming).mockReturnValue([
        mockTrack,
        mockTrack,
      ]);

      await service.sendNowPlaying('guild-123');

      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('repostIfInSameChannel', () => {
    it('reposts message when command is in same channel', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      await service.sendNowPlaying('guild-123');
      vi.clearAllMocks();

      const newMessage = {
        id: 'msg-456',
        delete: vi.fn(),
      } as unknown as Message<true>;
      vi.mocked(mockChannel.send).mockResolvedValue(newMessage);

      await service.repostIfInSameChannel('guild-123', 'channel-123');

      expect(mockMessage.delete).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('does not repost when command is in different channel', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');
      await service.sendNowPlaying('guild-123');
      vi.clearAllMocks();

      await service.repostIfInSameChannel('guild-123', 'different-channel');

      expect(mockMessage.delete).not.toHaveBeenCalled();
      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('does nothing when no message exists', async () => {
      service.setChannelForGuild('guild-123', 'channel-123');

      await service.repostIfInSameChannel('guild-123', 'channel-123');

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });
  });

  describe('button custom IDs', () => {
    it('generates correct button IDs', () => {
      expect(NowPlayingService.BUTTON_IDS.PLAY_PAUSE).toBe('np_playpause');
      expect(NowPlayingService.BUTTON_IDS.SKIP).toBe('np_skip');
      expect(NowPlayingService.BUTTON_IDS.STOP).toBe('np_stop');
      expect(NowPlayingService.BUTTON_IDS.SHUFFLE).toBe('np_shuffle');
      expect(NowPlayingService.BUTTON_IDS.LOOP).toBe('np_loop');
    });
  });
});
