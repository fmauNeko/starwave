import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YtDlpService, YtDlpVideoInfo } from '../yt-dlp.service';
import { YouTubeProvider } from './youtube.provider';

function createMockYtDlpService(
  overrides: Partial<YtDlpService> = {},
): YtDlpService {
  return {
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    getVideoInfo: vi.fn().mockResolvedValue({
      title: 'Test Video',
      duration: 180,
      thumbnail: 'https://example.com/thumb.jpg',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    } satisfies YtDlpVideoInfo),
    getAudioUrl: vi
      .fn()
      .mockResolvedValue('https://example.com/audio.webm?token=abc'),
    forceUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as YtDlpService;
}

describe('YouTubeProvider', () => {
  let provider: YouTubeProvider;
  let mockYtDlpService: YtDlpService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockYtDlpService = createMockYtDlpService();
    provider = new YouTubeProvider(mockYtDlpService);
    provider.onModuleInit();
  });

  describe('canHandle', () => {
    it('returns true for youtube.com watch URL', () => {
      expect(
        provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe(true);
    });

    it('returns true for youtu.be URL', () => {
      expect(provider.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('returns true for youtube.com embed URL', () => {
      expect(provider.canHandle('https://youtube.com/embed/dQw4w9WgXcQ')).toBe(
        true,
      );
    });

    it('returns true for bare video ID', () => {
      expect(provider.canHandle('dQw4w9WgXcQ')).toBe(true);
    });

    it('returns false for non-YouTube URL', () => {
      expect(provider.canHandle('https://soundcloud.com/artist/track')).toBe(
        false,
      );
    });

    it('returns false for invalid URL', () => {
      expect(provider.canHandle('not-a-valid-url')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('returns track info for valid URL', async () => {
      const track = await provider.fetchTrackInfo(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test Video',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        requestedBy: 'user#1234',
      });
      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('normalizes video ID to canonical URL', async () => {
      await provider.fetchTrackInfo('dQw4w9WgXcQ', 'user#1234');

      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('throws error for invalid URL', async () => {
      await expect(
        provider.fetchTrackInfo('https://example.com/not-youtube', 'user#1234'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockYtDlpService.getVideoInfo).not.toHaveBeenCalled();
    });
  });

  describe('getAudioUrl', () => {
    it('returns audio URL for valid video URL', async () => {
      const audioUrl = await provider.getAudioUrl(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(audioUrl).toBe('https://example.com/audio.webm?token=abc');
      expect(mockYtDlpService.getAudioUrl).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('normalizes video ID to canonical URL', async () => {
      await provider.getAudioUrl('dQw4w9WgXcQ');

      expect(mockYtDlpService.getAudioUrl).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('throws error for invalid URL', async () => {
      await expect(
        provider.getAudioUrl('https://example.com/not-youtube'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockYtDlpService.getAudioUrl).not.toHaveBeenCalled();
    });

    it('propagates yt-dlp errors', async () => {
      vi.mocked(mockYtDlpService.getAudioUrl).mockRejectedValueOnce(
        new Error('yt-dlp exited with code 1'),
      );

      await expect(provider.getAudioUrl('dQw4w9WgXcQ')).rejects.toThrow(
        'yt-dlp exited with code 1',
      );
    });
  });

  describe('name', () => {
    it('returns YouTube as provider name', () => {
      expect(provider.name).toBe('YouTube');
    });
  });
});
