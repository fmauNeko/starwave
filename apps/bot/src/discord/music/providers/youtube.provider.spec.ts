import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  YtDlpAudioInfo,
  YtDlpService,
  YtDlpVideoInfo,
} from '../yt-dlp.service';
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
    getAudioInfo: vi.fn().mockResolvedValue({
      url: 'https://example.com/audio.webm?token=abc',
      codec: 'opus',
      container: 'webm',
    } satisfies YtDlpAudioInfo),
    forceUpdate: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({
      title: 'Search Result Video',
      duration: 240,
      thumbnail: 'https://example.com/search-thumb.jpg',
      url: 'https://www.youtube.com/watch?v=searchResult',
    } satisfies YtDlpVideoInfo),
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

  describe('getAudioInfo', () => {
    it('returns audio info for valid video URL', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(audioInfo).toEqual({
        url: 'https://example.com/audio.webm?token=abc',
        codec: 'opus',
        container: 'webm',
      });
      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('normalizes video ID to canonical URL', async () => {
      await provider.getAudioInfo('dQw4w9WgXcQ');

      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('throws error for invalid URL', async () => {
      await expect(
        provider.getAudioInfo('https://example.com/not-youtube'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockYtDlpService.getAudioInfo).not.toHaveBeenCalled();
    });

    it('propagates yt-dlp errors', async () => {
      vi.mocked(mockYtDlpService.getAudioInfo).mockRejectedValueOnce(
        new Error('yt-dlp exited with code 1'),
      );

      await expect(provider.getAudioInfo('dQw4w9WgXcQ')).rejects.toThrow(
        'yt-dlp exited with code 1',
      );
    });
  });

  describe('name', () => {
    it('returns YouTube as provider name', () => {
      expect(provider.name).toBe('YouTube');
    });
  });

  describe('search', () => {
    it('returns track info from search query', async () => {
      const track = await provider.search('test query', 'user#1234');

      expect(track).toMatchObject({
        url: 'https://www.youtube.com/watch?v=searchResult',
        title: 'Search Result Video',
        duration: 240,
        thumbnail: 'https://example.com/search-thumb.jpg',
        requestedBy: 'user#1234',
      });
    });

    it('delegates search to yt-dlp service', async () => {
      await provider.search('my search query', 'user#1234');

      expect(mockYtDlpService.search).toHaveBeenCalledWith('my search query');
    });

    it('propagates yt-dlp search errors', async () => {
      vi.mocked(mockYtDlpService.search).mockRejectedValueOnce(
        new Error('No search results found'),
      );

      await expect(provider.search('nonexistent', 'user#1234')).rejects.toThrow(
        'No search results found',
      );
    });
  });
});
