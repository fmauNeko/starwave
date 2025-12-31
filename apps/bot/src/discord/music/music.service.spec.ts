/* eslint-disable @typescript-eslint/unbound-method */
import { AudioPlayerStatus, type AudioResource } from '@discordjs/voice';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { MusicService } from './music.service';
import { VoiceService } from '../voice/voice.service';
import { AudioFilterService } from './audio-filter.service';
import { ZmqVolumeController } from './zmq-volume-controller.service';
import { LoopMode } from './music-queue';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import type { MusicProvider } from './providers/music-provider.interface';

const mockTrack = {
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Test Video',
  duration: 180,
  thumbnail: 'https://example.com/thumb.jpg',
  requestedBy: 'user#1234',
};

describe('MusicService', () => {
  let service: MusicService;
  let voiceService: VoiceService;
  let audioFilterService: AudioFilterService;
  let volumeController: ZmqVolumeController;
  let providerDiscovery: MusicProviderDiscovery;
  let mockProvider: MusicProvider;

  const mockAudioResource = {} as AudioResource;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      name: 'MockProvider',
      canHandle: vi.fn().mockReturnValue(true),
      fetchTrackInfo: vi.fn().mockResolvedValue(mockTrack),
      getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.webm'),
    };

    providerDiscovery = {
      getProviders: vi.fn().mockReturnValue([mockProvider]),
    } as unknown as MusicProviderDiscovery;

    audioFilterService = {
      createFilteredStream: vi.fn().mockReturnValue(new PassThrough()),
    } as unknown as AudioFilterService;

    voiceService = {
      play: vi.fn().mockReturnValue(mockAudioResource),
      stop: vi.fn().mockReturnValue(true),
      pause: vi.fn().mockReturnValue(true),
      unpause: vi.fn().mockReturnValue(true),
      getPlayer: vi.fn(),
      getPlayerStatus: vi.fn().mockReturnValue(AudioPlayerStatus.Idle),
    } as unknown as VoiceService;

    volumeController = {
      allocatePort: vi.fn(),
      getBindAddress: vi.fn().mockReturnValue('tcp://*:5555'),
      getVolume: vi.fn().mockReturnValue(0.25),
      connect: vi.fn(),
      cleanup: vi.fn(),
      isConnected: vi.fn().mockReturnValue(false),
      setVolume: vi.fn(),
    } as unknown as ZmqVolumeController;

    service = new MusicService(
      audioFilterService,
      voiceService,
      volumeController,
      providerDiscovery,
    );
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
      expect(voiceService.play).toHaveBeenCalled();
    });

    it('uses provider to fetch track info', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(mockProvider.fetchTrackInfo).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );
    });

    it('uses provider to get audio URL', async () => {
      await service.play(
        'guild-123',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(mockProvider.getAudioUrl).toHaveBeenCalledWith(
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
      expect(voiceService.stop).toHaveBeenCalledWith('guild-123');
    });
  });

  describe('pause/resume', () => {
    it('delegates pause to voice service', () => {
      const result = service.pause('guild-123');

      expect(result).toBe(true);
      expect(voiceService.pause).toHaveBeenCalledWith('guild-123');
    });

    it('delegates resume to voice service', () => {
      const result = service.resume('guild-123');

      expect(result).toBe(true);
      expect(voiceService.unpause).toHaveBeenCalledWith('guild-123');
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

  describe('shuffle', () => {
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
  });
});
