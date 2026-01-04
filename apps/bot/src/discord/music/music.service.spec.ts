import { AudioPlayerStatus, type AudioResource } from '@discordjs/voice';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceService } from '../voice/voice.service';
import { LoopMode } from './music-queue';
import { MusicService } from './music.service';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import type { MusicProvider } from './providers/music-provider.interface';

const mockTrack = {
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Test Video',
  duration: 180,
  thumbnail: 'https://example.com/thumb.jpg',
  requestedBy: 'user#1234',
};

/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
describe('MusicService', () => {
  let service: MusicService;
  let voiceService: VoiceService;
  let providerDiscovery: MusicProviderDiscovery;
  let mockProvider: MusicProvider;

  const mockAudioResource = {} as AudioResource;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      name: 'MockProvider',
      canHandle: vi.fn().mockReturnValue(true),
      fetchTrackInfo: vi.fn().mockResolvedValue(mockTrack),
      getAudioInfo: vi.fn().mockResolvedValue({
        url: 'https://example.com/audio.webm',
        codec: 'opus',
        container: 'webm',
      }),
      search: vi.fn().mockResolvedValue(mockTrack),
    };

    providerDiscovery = {
      getProviders: vi.fn().mockReturnValue([mockProvider]),
    } as unknown as MusicProviderDiscovery;

    voiceService = {
      play: vi.fn().mockReturnValue(mockAudioResource),
      stop: vi.fn().mockReturnValue(true),
      pause: vi.fn().mockReturnValue(true),
      unpause: vi.fn().mockReturnValue(true),
      getPlayer: vi.fn(),
      getPlayerStatus: vi.fn().mockReturnValue(AudioPlayerStatus.Idle),
      setVolume: vi.fn().mockReturnValue(0.5),
      getVolume: vi.fn().mockReturnValue(0.25),
    } as unknown as VoiceService;

    service = new MusicService(voiceService, providerDiscovery);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('play', () => {
    it('adds track to queue and plays if queue was empty', async () => {
      const track = await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(track).toMatchObject({
        title: 'Test Video',
        duration: 180,
        requestedBy: 'user#1234',
      });
      expect(vi.mocked(voiceService.play)).toHaveBeenCalled();
    });

    it('uses provider to fetch track info', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(vi.mocked(mockProvider.fetchTrackInfo)).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );
    });

    it('uses provider to get audio info', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(vi.mocked(mockProvider.getAudioInfo)).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('throws error when no provider can handle URL', async () => {
      vi.mocked(mockProvider.canHandle).mockReturnValue(false);

      await expect(
        service.play('guild-123', 'unsupported://url', 'user#1234'),
      ).rejects.toThrow('No provider found for URL');
    });
  });

  describe('skip', () => {
    it('returns undefined when no queue exists', () => {
      const result = service.skip('guild-123');
      expect(result).toBeUndefined();
    });

    it('plays next track when available', async () => {
      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );

      vi.clearAllMocks();

      const next = service.skip('guild-123');

      expect(next).toMatchObject({ title: 'Track 2' });
      // playTrack is called asynchronously with void, so wait for it
      await vi.waitFor(() => {
        expect(vi.mocked(voiceService.play)).toHaveBeenCalled();
      });
    });

    it('stops voice when no next track', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      vi.clearAllMocks();

      const next = service.skip('guild-123');

      expect(next).toBeUndefined();
      expect(vi.mocked(voiceService.stop)).toHaveBeenCalledWith('guild-123');
    });
  });

  describe('stop', () => {
    it('returns false when no queue exists', () => {
      const result = service.stop('guild-123');
      expect(result).toBe(false);
    });

    it('clears queue and stops voice', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      const result = service.stop('guild-123');

      expect(result).toBe(true);
      expect(vi.mocked(voiceService.stop)).toHaveBeenCalledWith('guild-123');
    });
  });

  describe('pause/resume', () => {
    it('delegates pause to voice service', () => {
      const result = service.pause('guild-123');

      expect(result).toBe(true);
      expect(vi.mocked(voiceService.pause)).toHaveBeenCalledWith('guild-123');
    });

    it('delegates resume to voice service', () => {
      const result = service.resume('guild-123');

      expect(result).toBe(true);
      expect(vi.mocked(voiceService.unpause)).toHaveBeenCalledWith('guild-123');
    });
  });

  describe('getNowPlaying', () => {
    it('returns undefined when no queue exists', () => {
      const result = service.getNowPlaying('guild-123');
      expect(result).toBeUndefined();
    });

    it('returns current track', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      const result = service.getNowPlaying('guild-123');

      expect(result).toMatchObject({
        title: 'Test Video',
      });
    });
  });

  describe('getQueue', () => {
    it('returns empty array when no queue exists', () => {
      const result = service.getQueue('guild-123');
      expect(result).toEqual([]);
    });
  });

  describe('shuffle - insufficient tracks', () => {
    it('returns false when not enough tracks', () => {
      const result = service.shuffle('guild-123');
      expect(result).toBe(false);
    });
  });

  describe('cycleLoopMode', () => {
    it('cycles through loop modes', () => {
      expect(service.cycleLoopMode('guild-123')).toBe(LoopMode.Track);
      expect(service.cycleLoopMode('guild-123')).toBe(LoopMode.Queue);
      expect(service.cycleLoopMode('guild-123')).toBe(LoopMode.None);
    });
  });

  describe('isPlaying/isPaused', () => {
    it('returns false when not playing', () => {
      vi.mocked(voiceService.getPlayerStatus).mockReturnValue(
        AudioPlayerStatus.Idle,
      );

      expect(service.isPlaying('guild-123')).toBe(false);
      expect(service.isPaused('guild-123')).toBe(false);
    });

    it('returns true when playing', () => {
      vi.mocked(voiceService.getPlayerStatus).mockReturnValue(
        AudioPlayerStatus.Playing,
      );

      expect(service.isPlaying('guild-123')).toBe(true);
      expect(service.isPaused('guild-123')).toBe(false);
    });

    it('returns true when paused', () => {
      vi.mocked(voiceService.getPlayerStatus).mockReturnValue(
        AudioPlayerStatus.Paused,
      );

      expect(service.isPlaying('guild-123')).toBe(false);
      expect(service.isPaused('guild-123')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes queue for guild', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(service.getNowPlaying('guild-123')).toBeDefined();

      service.cleanup('guild-123');

      expect(service.getNowPlaying('guild-123')).toBeUndefined();
    });

    it('stops voice playback', () => {
      service.cleanup('guild-123');

      expect(vi.mocked(voiceService.stop)).toHaveBeenCalledWith('guild-123');
    });
  });

  describe('getUpcoming', () => {
    it('returns empty array when no queue exists', () => {
      const result = service.getUpcoming('guild-123');
      expect(result).toEqual([]);
    });

    it('returns upcoming tracks', async () => {
      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );

      const upcoming = service.getUpcoming('guild-123');

      expect(upcoming).toHaveLength(1);
      expect(upcoming[0]).toMatchObject({ title: 'Track 2' });
    });
  });

  describe('clearQueue', () => {
    it('returns false when no queue exists', () => {
      const result = service.clearQueue('guild-123');
      expect(result).toBe(false);
    });

    it('clears queue but keeps current track', async () => {
      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );

      const result = service.clearQueue('guild-123');

      expect(result).toBe(true);
      expect(service.getNowPlaying('guild-123')).toMatchObject({
        title: 'Test Video',
      });
      expect(service.getUpcoming('guild-123')).toHaveLength(0);
    });
  });

  describe('shuffle', () => {
    it('returns true when enough tracks to shuffle', async () => {
      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );

      const result = service.shuffle('guild-123');

      expect(result).toBe(true);
    });

    it('returns false when only one track', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );

      const result = service.shuffle('guild-123');

      expect(result).toBe(false);
    });
  });

  describe('getLoopMode', () => {
    it('returns None when no queue exists', () => {
      const result = service.getLoopMode('guild-123');
      expect(result).toBe(LoopMode.None);
    });

    it('returns current loop mode', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      service.cycleLoopMode('guild-123');

      const result = service.getLoopMode('guild-123');
      expect(result).toBe(LoopMode.Track);
    });
  });

  describe('remove', () => {
    it('returns undefined when no queue exists', () => {
      const result = service.remove('guild-123', 0);
      expect(result).toBeUndefined();
    });

    it('returns undefined when trying to remove current track', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );

      const result = service.remove('guild-123', 0);
      expect(result).toBeUndefined();
    });

    it('removes track at specified index', async () => {
      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );

      const removed = service.remove('guild-123', 1);

      expect(removed).toMatchObject({ title: 'Track 2' });
      expect(service.getUpcoming('guild-123')).toHaveLength(0);
    });
  });

  describe('setVolume', () => {
    it('throws error when not playing or paused', () => {
      vi.mocked(voiceService.getPlayerStatus).mockReturnValue(
        AudioPlayerStatus.Idle,
      );

      expect(() => service.setVolume('guild-123', 0.5)).toThrow(
        'No active playback to adjust volume',
      );
    });

    it('sets volume when playing', () => {
      vi.mocked(voiceService.getPlayerStatus).mockReturnValue(
        AudioPlayerStatus.Playing,
      );
      vi.mocked(voiceService.setVolume).mockReturnValue(0.75);

      const result = service.setVolume('guild-123', 0.75);

      expect(vi.mocked(voiceService.setVolume)).toHaveBeenCalledWith(
        'guild-123',
        0.75,
      );
      expect(result).toBe(0.75);
    });

    it('sets volume when paused', () => {
      vi.mocked(voiceService.getPlayerStatus).mockReturnValue(
        AudioPlayerStatus.Paused,
      );
      vi.mocked(voiceService.setVolume).mockReturnValue(0.5);

      const result = service.setVolume('guild-123', 0.5);

      expect(vi.mocked(voiceService.setVolume)).toHaveBeenCalledWith(
        'guild-123',
        0.5,
      );
      expect(result).toBe(0.5);
    });
  });

  describe('getVolume', () => {
    it('returns volume from voice service', () => {
      vi.mocked(voiceService.getVolume).mockReturnValue(0.5);

      const result = service.getVolume('guild-123');

      expect(vi.mocked(voiceService.getVolume)).toHaveBeenCalledWith(
        'guild-123',
      );
      expect(result).toBe(0.5);
    });
  });

  describe('setupAutoPlay', () => {
    it('does nothing when no player exists', () => {
      vi.mocked(voiceService.getPlayer).mockReturnValue(undefined);

      service.setupAutoPlay('guild-123');

      expect(vi.mocked(voiceService.getPlayer)).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('sets up idle listener on player', () => {
      const mockPlayer = {
        on: vi.fn(),
      };
      vi.mocked(voiceService.getPlayer).mockReturnValue(mockPlayer as never);

      service.setupAutoPlay('guild-123');

      expect(mockPlayer.on).toHaveBeenCalledWith(
        AudioPlayerStatus.Idle,
        expect.any(Function),
      );
    });

    it('plays next track when player goes idle', async () => {
      let idleCallback: () => void = vi.fn();
      const mockPlayer = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === AudioPlayerStatus.Idle) {
            idleCallback = callback;
          }
        }),
      };
      vi.mocked(voiceService.getPlayer).mockReturnValue(mockPlayer as never);

      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );
      service.setupAutoPlay('guild-123');
      vi.clearAllMocks();

      idleCallback();

      await vi.waitFor(() => {
        expect(vi.mocked(voiceService.play)).toHaveBeenCalled();
      });
    });

    it('does nothing on idle when queue does not exist', () => {
      let idleCallback: () => void = vi.fn();
      const mockPlayer = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === AudioPlayerStatus.Idle) {
            idleCallback = callback;
          }
        }),
      };
      vi.mocked(voiceService.getPlayer).mockReturnValue(mockPlayer as never);

      service.setupAutoPlay('guild-123');
      vi.clearAllMocks();

      idleCallback();

      expect(vi.mocked(voiceService.play)).not.toHaveBeenCalled();
    });

    it('does not register duplicate listeners when called multiple times', () => {
      const mockPlayer = {
        on: vi.fn(),
      };
      vi.mocked(voiceService.getPlayer).mockReturnValue(mockPlayer as never);

      service.setupAutoPlay('guild-123');
      service.setupAutoPlay('guild-123');

      expect(mockPlayer.on).toHaveBeenCalledTimes(1);
    });

    it('allows new listener after cleanup', () => {
      const mockPlayer = {
        on: vi.fn(),
      };
      vi.mocked(voiceService.getPlayer).mockReturnValue(mockPlayer as never);

      service.setupAutoPlay('guild-123');
      service.cleanup('guild-123');
      service.setupAutoPlay('guild-123');

      expect(mockPlayer.on).toHaveBeenCalledTimes(2);
    });
  });

  describe('play - queuing behavior', () => {
    it('does not play when queue already has tracks', async () => {
      const mockTrack2 = { ...mockTrack, title: 'Track 2' };
      vi.mocked(mockProvider.fetchTrackInfo)
        .mockResolvedValueOnce(mockTrack)
        .mockResolvedValueOnce(mockTrack2);

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      vi.clearAllMocks();

      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=2',
        'user#1234',
      );

      expect(vi.mocked(voiceService.play)).not.toHaveBeenCalled();
    });
  });

  describe('searchAndPlay', () => {
    it('searches using first provider and adds track to queue', async () => {
      const searchResultTrack = {
        ...mockTrack,
        title: 'Search Result',
        url: 'https://youtube.com/watch?v=searchResult',
      };
      vi.mocked(mockProvider.search).mockResolvedValue(searchResultTrack);

      const track = await service.searchAndPlay(
        'guild-123',
        'test search query',
        'user#1234',
      );

      expect(track).toMatchObject({
        title: 'Search Result',
        url: 'https://youtube.com/watch?v=searchResult',
        requestedBy: 'user#1234',
      });
      expect(vi.mocked(mockProvider.search)).toHaveBeenCalledWith(
        'test search query',
        'user#1234',
      );
    });

    it('plays track immediately if queue was empty', async () => {
      const searchResultTrack = {
        ...mockTrack,
        title: 'Search Result',
        url: 'https://youtube.com/watch?v=searchResult',
      };
      vi.mocked(mockProvider.search).mockResolvedValue(searchResultTrack);

      await service.searchAndPlay('guild-123', 'test query', 'user#1234');

      expect(vi.mocked(voiceService.play)).toHaveBeenCalled();
    });

    it('queues track without playing if queue already has tracks', async () => {
      // First add a track to the queue
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=1',
        'user#1234',
      );
      vi.clearAllMocks();

      const searchResultTrack = {
        ...mockTrack,
        title: 'Search Result',
        url: 'https://youtube.com/watch?v=searchResult',
      };
      vi.mocked(mockProvider.search).mockResolvedValue(searchResultTrack);

      await service.searchAndPlay('guild-123', 'test query', 'user#1234');

      expect(vi.mocked(mockProvider.search)).toHaveBeenCalled();
      expect(vi.mocked(voiceService.play)).not.toHaveBeenCalled();
    });

    it('throws error when no providers available', async () => {
      vi.mocked(providerDiscovery.getProviders).mockReturnValue([]);

      await expect(
        service.searchAndPlay('guild-123', 'test query', 'user#1234'),
      ).rejects.toThrow('No search provider available');
    });

    it('propagates search errors from provider', async () => {
      vi.mocked(mockProvider.search).mockRejectedValue(
        new Error('No search results found'),
      );

      await expect(
        service.searchAndPlay('guild-123', 'nonexistent', 'user#1234'),
      ).rejects.toThrow('No search results found');
    });
  });
});
/* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
