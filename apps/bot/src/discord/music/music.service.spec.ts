/* eslint-disable @typescript-eslint/unbound-method */
import { TestBed, Mocked } from '@suites/unit';
import { AudioPlayerStatus, type AudioResource } from '@discordjs/voice';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { MusicService } from './music.service';
import { VoiceService } from '../voice/voice.service';
import { AudioFilterService } from './audio-filter.service';
import { LoopMode } from './music-queue';

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: vi.fn().mockResolvedValue({
      getBasicInfo: vi.fn().mockResolvedValue({
        basic_info: {
          title: 'Test Video',
          duration: 180,
          thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
        },
        streaming_data: {
          adaptive_formats: [
            {
              has_audio: true,
              has_video: false,
              url: 'https://example.com/audio.webm',
              mime_type: 'audio/webm; codecs="opus"',
            },
          ],
        },
      }),
    }),
  },
  UniversalCache: vi.fn(),
  ClientType: {
    ANDROID: 'ANDROID',
    WEB: 'WEB',
    IOS: 'IOS',
    YTMUSIC: 'YTMUSIC',
  },
}));

describe('MusicService', () => {
  let service: MusicService;
  let voiceService: Mocked<VoiceService>;
  let audioFilterService: Mocked<AudioFilterService>;

  const mockAudioResource = {} as AudioResource;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { unit, unitRef } = await TestBed.solitary(MusicService).compile();
    service = unit;
    voiceService = unitRef.get(VoiceService);
    audioFilterService = unitRef.get(AudioFilterService);

    audioFilterService.createFilteredStream.mockImplementation(
      () => new PassThrough(),
    );

    await service.onModuleInit();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('play', () => {
    it('adds track to queue and plays if queue was empty', async () => {
      voiceService.play.mockReturnValue(mockAudioResource);

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

    it('extracts video ID from youtu.be URL', async () => {
      voiceService.play.mockReturnValue(mockAudioResource);

      const track = await service.play(
        'guild-123',
        'https://youtu.be/dQw4w9WgXcQ',
        'user#1234',
      );

      expect(track).toMatchObject({
        title: 'Test Video',
      });
    });

    it('extracts video ID from embed URL', async () => {
      voiceService.play.mockReturnValue(mockAudioResource);

      const track = await service.play(
        'guild-123',
        'https://youtube.com/embed/dQw4w9WgXcQ',
        'user#1234',
      );

      expect(track).toMatchObject({
        title: 'Test Video',
      });
    });

    it('throws error for invalid URL', async () => {
      await expect(
        service.play('guild-123', 'not-a-youtube-url', 'user#1234'),
      ).rejects.toThrow('Invalid YouTube URL');
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
      voiceService.play.mockReturnValue(mockAudioResource);
      voiceService.stop.mockReturnValue(true);

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
      voiceService.pause.mockReturnValue(true);

      const result = service.pause('guild-123');

      expect(result).toBe(true);
      expect(voiceService.pause).toHaveBeenCalledWith('guild-123');
    });

    it('delegates resume to voice service', () => {
      voiceService.unpause.mockReturnValue(true);

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
      voiceService.play.mockReturnValue(mockAudioResource);

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
      voiceService.getPlayerStatus.mockReturnValue(AudioPlayerStatus.Idle);

      expect(service.isPlaying('guild-123')).toBe(false);
      expect(service.isPaused('guild-123')).toBe(false);
    });

    it('returns true when playing', () => {
      voiceService.getPlayerStatus.mockReturnValue(AudioPlayerStatus.Playing);

      expect(service.isPlaying('guild-123')).toBe(true);
      expect(service.isPaused('guild-123')).toBe(false);
    });

    it('returns true when paused', () => {
      voiceService.getPlayerStatus.mockReturnValue(AudioPlayerStatus.Paused);

      expect(service.isPlaying('guild-123')).toBe(false);
      expect(service.isPaused('guild-123')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes queue for guild', async () => {
      voiceService.play.mockReturnValue(mockAudioResource);

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
