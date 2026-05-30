import { StreamType } from '@discordjs/voice';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  VideoMetadata,
  YouTubeStreamService,
} from '../youtube/youtube-stream.service';
import { YouTubeProvider } from './youtube.provider';

function createMockStreamService(
  overrides: Partial<YouTubeStreamService> = {},
): YouTubeStreamService {
  return {
    getMetadata: vi.fn().mockResolvedValue({
      title: 'Test Video',
      duration: 180,
      thumbnail: 'https://example.com/thumb.jpg',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    } satisfies VideoMetadata),
    search: vi.fn().mockResolvedValue({
      title: 'Search Result Video',
      duration: 240,
      thumbnail: 'https://example.com/search-thumb.jpg',
      url: 'https://www.youtube.com/watch?v=searchResult',
    } satisfies VideoMetadata),
    getAudioStream: vi.fn().mockResolvedValue({
      source: Readable.from([]),
      streamType: StreamType.WebmOpus,
    }),
    ...overrides,
  } as unknown as YouTubeStreamService;
}

describe('YouTubeProvider', () => {
  let provider: YouTubeProvider;
  let mockStreamService: YouTubeStreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamService = createMockStreamService();
    provider = new YouTubeProvider(mockStreamService);
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
      expect(mockStreamService.getMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ');
    });

    it('normalizes video ID to canonical URL via getMetadata', async () => {
      await provider.fetchTrackInfo('dQw4w9WgXcQ', 'user#1234');

      expect(mockStreamService.getMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ');
    });

    it('throws error for invalid URL', async () => {
      await expect(
        provider.fetchTrackInfo('https://example.com/not-youtube', 'user#1234'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockStreamService.getMetadata).not.toHaveBeenCalled();
    });
  });

  describe('getAudioInfo', () => {
    it('delegates to YouTubeStreamService.getAudioStream and returns Readable source', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(audioInfo.source).toBeInstanceOf(Readable);
      expect(audioInfo.streamType).toBe(StreamType.WebmOpus);
      expect(mockStreamService.getAudioStream).toHaveBeenCalledWith(
        'dQw4w9WgXcQ',
      );
    });

    it('throws error for invalid URL without calling stream service', async () => {
      await expect(
        provider.getAudioInfo('https://example.com/not-youtube'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockStreamService.getAudioStream).not.toHaveBeenCalled();
    });

    it('propagates stream service errors', async () => {
      vi.mocked(mockStreamService.getAudioStream).mockRejectedValueOnce(
        new Error('SABR stream failed'),
      );

      await expect(provider.getAudioInfo('dQw4w9WgXcQ')).rejects.toThrow(
        'SABR stream failed',
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

    it('delegates search to YouTubeStreamService', async () => {
      await provider.search('my search query', 'user#1234');

      expect(mockStreamService.search).toHaveBeenCalledWith('my search query');
    });

    it('propagates stream service search errors', async () => {
      vi.mocked(mockStreamService.search).mockRejectedValueOnce(
        new Error('No search results found'),
      );

      await expect(provider.search('nonexistent', 'user#1234')).rejects.toThrow(
        'No search results found',
      );
    });
  });
});
