import * as discordVoice from '@discordjs/voice';
import { TestBed } from '@suites/unit';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceService } from './voice.service';

vi.mock('@discordjs/voice', () => ({
  joinVoiceChannel: vi.fn(),
  getVoiceConnection: vi.fn(),
  entersState: vi.fn(),
  createAudioPlayer: vi.fn(),
  createAudioResource: vi.fn(),
  VoiceConnectionStatus: {
    Ready: 'ready',
    Disconnected: 'disconnected',
    Signalling: 'signalling',
    Connecting: 'connecting',
  },
  AudioPlayerStatus: {
    Idle: 'idle',
    Playing: 'playing',
    Paused: 'paused',
  },
  NoSubscriberBehavior: {
    Pause: 'pause',
  },
  StreamType: {
    OggOpus: 'ogg/opus',
    WebmOpus: 'webm/opus',
    Arbitrary: 'arbitrary',
  },
}));

/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
describe('VoiceService', () => {
  let service: VoiceService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { unit } = await TestBed.solitary(VoiceService).compile();
    service = unit;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('join', () => {
    it('creates a voice connection and waits for ready state', async () => {
      const mockConnection = {
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockChannel = {
        id: 'channel-123',
        name: 'General',
        guild: {
          id: 'guild-123',
          name: 'Test Guild',
          voiceAdapterCreator: vi.fn(),
        } as unknown as Guild,
      } as unknown as VoiceBasedChannel;

      vi.mocked(discordVoice.joinVoiceChannel).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.entersState).mockResolvedValue(
        mockConnection as never,
      );

      const result = await service.join(mockChannel);

      expect(discordVoice.joinVoiceChannel).toHaveBeenCalledWith({
        channelId: 'channel-123',
        guildId: 'guild-123',
        adapterCreator: mockChannel.guild.voiceAdapterCreator,
      });
      expect(discordVoice.entersState).toHaveBeenCalledWith(
        mockConnection,
        discordVoice.VoiceConnectionStatus.Ready,
        30_000,
      );
      expect(result).toBe(mockConnection);
    });

    it('destroys connection and throws when join times out', async () => {
      const mockConnection = {
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockChannel = {
        id: 'channel-123',
        name: 'General',
        guild: {
          id: 'guild-123',
          name: 'Test Guild',
          voiceAdapterCreator: vi.fn(),
        } as unknown as Guild,
      } as unknown as VoiceBasedChannel;

      vi.mocked(discordVoice.joinVoiceChannel).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.entersState).mockRejectedValue(
        new Error('Timeout'),
      );

      await expect(service.join(mockChannel)).rejects.toThrow(
        'Failed to join voice channel "General" within 30 seconds',
      );
      expect(mockConnection.destroy).toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('destroys existing connection and returns true', () => {
      const mockConnection = {
        destroy: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );

      const result = service.leave('guild-123');

      expect(discordVoice.getVoiceConnection).toHaveBeenCalledWith('guild-123');
      expect(mockConnection.destroy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false when no connection exists', () => {
      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(undefined);

      const result = service.leave('guild-123');

      expect(result).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('returns true when connection exists', () => {
      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      expect(service.isConnected('guild-123')).toBe(true);
    });

    it('returns false when no connection exists', () => {
      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(undefined);

      expect(service.isConnected('guild-123')).toBe(false);
    });
  });

  describe('play', () => {
    it('throws when not connected to voice', () => {
      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(undefined);

      expect(() => service.play('guild-123', 'test.mp3')).toThrow(
        'Not connected to voice in guild guild-123',
      );
    });

    it('creates player, subscribes connection, and plays audio', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };
      const mockResource = { metadata: {} };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue(
        mockResource as never,
      );

      const result = service.play('guild-123', 'test.mp3');

      expect(discordVoice.createAudioPlayer).toHaveBeenCalled();
      expect(mockConnection.subscribe).toHaveBeenCalledWith(mockPlayer);
      expect(discordVoice.createAudioResource).toHaveBeenCalledWith(
        'test.mp3',
        {
          inputType: undefined,
          inlineVolume: undefined,
        },
      );
      expect(mockPlayer.play).toHaveBeenCalledWith(mockResource);
      expect(result).toBe(mockResource);
    });

    it('reuses existing player for same guild', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };
      const mockResource = { metadata: {} };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue(
        mockResource as never,
      );

      service.play('guild-123', 'test1.mp3');
      service.play('guild-123', 'test2.mp3');

      expect(discordVoice.createAudioPlayer).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('returns false when no player exists', () => {
      expect(service.stop('guild-123')).toBe(false);
    });

    it('stops the player and returns true', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
        stop: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');
      const result = service.stop('guild-123');

      expect(mockPlayer.stop).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('pause', () => {
    it('returns false when no player exists', () => {
      expect(service.pause('guild-123')).toBe(false);
    });

    it('pauses the player', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
        pause: vi.fn().mockReturnValue(true),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');
      const result = service.pause('guild-123');

      expect(mockPlayer.pause).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('unpause', () => {
    it('returns false when no player exists', () => {
      expect(service.unpause('guild-123')).toBe(false);
    });

    it('unpauses the player', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
        unpause: vi.fn().mockReturnValue(true),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');
      const result = service.unpause('guild-123');

      expect(mockPlayer.unpause).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('getPlayer', () => {
    it('returns undefined when no player exists', () => {
      expect(service.getPlayer('guild-123')).toBeUndefined();
    });

    it('returns player when it exists', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');
      const result = service.getPlayer('guild-123');

      expect(result).toBe(mockPlayer);
    });
  });

  describe('getPlayerStatus', () => {
    it('returns undefined when no player exists', () => {
      expect(service.getPlayerStatus('guild-123')).toBeUndefined();
    });

    it('returns player status when player exists', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
        state: { status: discordVoice.AudioPlayerStatus.Playing },
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');
      const result = service.getPlayerStatus('guild-123');

      expect(result).toBe(discordVoice.AudioPlayerStatus.Playing);
    });
  });

  describe('connection handling', () => {
    it('sets up disconnection handler on join', async () => {
      const connectionHandlers: Record<string, (...args: unknown[]) => void> =
        {};
      const mockConnection = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          connectionHandlers[event] = handler;
        }),
        destroy: vi.fn(),
      };

      const mockChannel = {
        id: 'channel-123',
        name: 'General',
        guild: {
          id: 'guild-123',
          name: 'Test Guild',
          voiceAdapterCreator: vi.fn(),
        },
      } as unknown as VoiceBasedChannel;

      vi.mocked(discordVoice.joinVoiceChannel).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.entersState).mockResolvedValue(
        mockConnection as never,
      );

      await service.join(mockChannel);

      expect(mockConnection.on).toHaveBeenCalledWith(
        discordVoice.VoiceConnectionStatus.Disconnected,
        expect.any(Function),
      );
      expect(mockConnection.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });

    it('handles disconnection by attempting reconnect', async () => {
      const connectionHandlers: Record<string, (...args: unknown[]) => void> =
        {};
      const mockConnection = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          connectionHandlers[event] = handler;
        }),
        destroy: vi.fn(),
      };

      const mockChannel = {
        id: 'channel-123',
        name: 'General',
        guild: {
          id: 'guild-123',
          name: 'Test Guild',
          voiceAdapterCreator: vi.fn(),
        },
      } as unknown as VoiceBasedChannel;

      vi.mocked(discordVoice.joinVoiceChannel).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.entersState)
        .mockResolvedValueOnce(mockConnection as never)
        .mockResolvedValueOnce(mockConnection as never);

      await service.join(mockChannel);

      connectionHandlers[discordVoice.VoiceConnectionStatus.Disconnected]?.();

      await vi.waitFor(() => {
        expect(discordVoice.entersState).toHaveBeenCalledWith(
          mockConnection,
          discordVoice.VoiceConnectionStatus.Signalling,
          5_000,
        );
      });
    });

    it('destroys connection when reconnect fails', async () => {
      const connectionHandlers: Record<string, (...args: unknown[]) => void> =
        {};
      const mockConnection = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          connectionHandlers[event] = handler;
        }),
        destroy: vi.fn(),
      };

      const mockChannel = {
        id: 'channel-123',
        name: 'General',
        guild: {
          id: 'guild-123',
          name: 'Test Guild',
          voiceAdapterCreator: vi.fn(),
        },
      } as unknown as VoiceBasedChannel;

      vi.mocked(discordVoice.joinVoiceChannel).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.entersState)
        .mockResolvedValueOnce(mockConnection as never)
        .mockRejectedValue(new Error('Timeout'));

      await service.join(mockChannel);

      connectionHandlers[discordVoice.VoiceConnectionStatus.Disconnected]?.();

      await vi.waitFor(() => {
        expect(mockConnection.destroy).toHaveBeenCalled();
      });
    });

    it('handles connection error', async () => {
      const connectionHandlers: Record<string, (...args: unknown[]) => void> =
        {};
      const mockConnection = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          connectionHandlers[event] = handler;
        }),
        destroy: vi.fn(),
      };

      const mockChannel = {
        id: 'channel-123',
        name: 'General',
        guild: {
          id: 'guild-123',
          name: 'Test Guild',
          voiceAdapterCreator: vi.fn(),
        },
      } as unknown as VoiceBasedChannel;

      vi.mocked(discordVoice.joinVoiceChannel).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.entersState).mockResolvedValue(
        mockConnection as never,
      );

      await service.join(mockChannel);

      expect(() => {
        connectionHandlers['error']?.(new Error('Connection error'));
      }).not.toThrow();
    });
  });

  describe('player error handling', () => {
    it('handles player error without crashing', () => {
      let errorHandler: ((error: Error) => void) | undefined;
      const mockPlayer = {
        on: vi.fn((event: string, handler: (error: Error) => void) => {
          if (event === 'error') {
            errorHandler = handler;
          }
        }),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');

      expect(() => {
        errorHandler?.(new Error('Audio error'));
      }).not.toThrow();
    });

    it('handles player idle event', () => {
      let idleHandler: (() => void) | undefined;
      const mockPlayer = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === discordVoice.AudioPlayerStatus.Idle) {
            idleHandler = handler;
          }
        }),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');

      expect(() => {
        idleHandler?.();
      }).not.toThrow();
    });
  });

  describe('play with options', () => {
    it('passes inputType option to createAudioResource', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3', {
        inputType: discordVoice.StreamType.OggOpus,
      });

      expect(discordVoice.createAudioResource).toHaveBeenCalledWith(
        'test.mp3',
        {
          inputType: discordVoice.StreamType.OggOpus,
          inlineVolume: undefined,
        },
      );
    });

    it('passes inlineVolume option to createAudioResource', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3', { inlineVolume: true });

      expect(discordVoice.createAudioResource).toHaveBeenCalledWith(
        'test.mp3',
        {
          inputType: undefined,
          inlineVolume: true,
        },
      );
    });
  });

  describe('leave with existing player', () => {
    it('stops and cleans up player when leaving', () => {
      const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
        stop: vi.fn(),
      };
      const mockConnection = {
        subscribe: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        mockConnection as unknown as discordVoice.VoiceConnection,
      );
      vi.mocked(discordVoice.createAudioPlayer).mockReturnValue(
        mockPlayer as unknown as discordVoice.AudioPlayer,
      );
      vi.mocked(discordVoice.createAudioResource).mockReturnValue({} as never);

      service.play('guild-123', 'test.mp3');
      const result = service.leave('guild-123');

      expect(mockPlayer.stop).toHaveBeenCalled();
      expect(mockConnection.destroy).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
/* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
