import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YtDlpService, YtDlpVideoInfo } from '../yt-dlp.service';
import { DailymotionProvider } from './dailymotion.provider';
import { ProviderType } from './provider-types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockYtDlpService(
  overrides: Partial<YtDlpService> = {},
): YtDlpService {
  return {
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    getVideoInfo: vi.fn().mockResolvedValue({
      title: 'Test Video - Creator',
      duration: 300,
      thumbnail: 'https://example.com/thumb.jpg',
      url: 'https://www.dailymotion.com/video/x123abc',
    } satisfies YtDlpVideoInfo),
    getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.mp3'),
    getAudioInfo: vi.fn().mockResolvedValue({
      url: 'https://example.com/audio.mp3',
      codec: 'aac',
      container: 'mp4',
    }),
    forceUpdate: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({
      title: 'Search Result - Creator',
      duration: 240,
      thumbnail: 'https://example.com/search-thumb.jpg',
      url: 'https://www.dailymotion.com/video/x456def',
    } satisfies YtDlpVideoInfo),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as YtDlpService;
}

describe('DailymotionProvider', () => {
  let provider: DailymotionProvider;
  let mockYtDlpService: YtDlpService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockYtDlpService = createMockYtDlpService();
    provider = new DailymotionProvider(mockYtDlpService);
  });

  describe('canHandle', () => {
    it('returns true for dailymotion.com/video URL', () => {
      expect(
        provider.canHandle('https://www.dailymotion.com/video/x123abc'),
      ).toBe(true);
    });

    it('returns true for dailymotion.com without www', () => {
      expect(provider.canHandle('https://dailymotion.com/video/x123abc')).toBe(
        true,
      );
    });

    it('returns true for dai.ly short URL', () => {
      expect(provider.canHandle('https://dai.ly/x123abc')).toBe(true);
    });

    it('returns false for non-Dailymotion URL', () => {
      expect(
        provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(provider.canHandle('not-a-valid-url')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('returns track info from Dailymotion API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'x123abc',
            title: 'Amazing Video',
            duration: 180,
            thumbnail_url: 'https://dailymotion.com/thumb.jpg',
            'owner.screenname': 'Video Creator',
          }),
      });

      const track = await provider.fetchTrackInfo(
        'https://www.dailymotion.com/video/x123abc',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://www.dailymotion.com/video/x123abc',
        title: 'Amazing Video',
        duration: 180,
        thumbnail: 'https://dailymotion.com/thumb.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Dailymotion,
        artist: 'Video Creator',
        isLive: false,
      });
      expect(track.addedAt).toBeInstanceOf(Date);
    });

    it('falls back to yt-dlp when API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await provider.fetchTrackInfo(
        'https://www.dailymotion.com/video/x123abc',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://www.dailymotion.com/video/x123abc',
        title: 'Test Video - Creator',
        duration: 300,
        requestedBy: 'user#1234',
        provider: ProviderType.Dailymotion,
      });
      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalled();
    });
  });

  describe('getAudioInfo', () => {
    it('always uses yt-dlp for audio streaming', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://www.dailymotion.com/video/x123abc',
      );

      expect(audioInfo).toEqual({
        url: 'https://example.com/audio.mp3',
        codec: 'aac',
        container: 'mp4',
      });
      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://www.dailymotion.com/video/x123abc',
      );
    });
  });

  describe('search', () => {
    it('returns tracks from Dailymotion search API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            list: [
              {
                id: 'x789ghi',
                title: 'Found Video',
                duration: 120,
                thumbnail_url: 'https://dailymotion.com/found-thumb.jpg',
                'owner.screenname': 'Some Creator',
              },
            ],
          }),
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({
        url: 'https://www.dailymotion.com/video/x789ghi',
        title: 'Found Video',
        duration: 120,
        thumbnail: 'https://dailymotion.com/found-thumb.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Dailymotion,
        artist: 'Some Creator',
      });
    });

    it('falls back to yt-dlp when search returns empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            list: [],
          }),
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'ytsearch1:test query site:dailymotion.com',
      );
    });

    it('falls back to yt-dlp when search API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(mockYtDlpService.search).toHaveBeenCalled();
    });
  });

  describe('name', () => {
    it('returns Dailymotion as provider name', () => {
      expect(provider.name).toBe('Dailymotion');
    });
  });

  describe('type', () => {
    it('returns correct provider type', () => {
      expect(provider.type).toBe(ProviderType.Dailymotion);
    });
  });

  describe('priority', () => {
    it('has priority of 35', () => {
      expect(provider.priority).toBe(35);
    });
  });

  describe('fetchTrackInfo edge cases', () => {
    it('falls back to yt-dlp when video ID cannot be extracted', async () => {
      const track = await provider.fetchTrackInfo(
        'https://www.dailymotion.com/some-invalid-path',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://www.dailymotion.com/video/x123abc',
        title: 'Test Video - Creator',
        duration: 300,
        requestedBy: 'user#1234',
        provider: ProviderType.Dailymotion,
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalled();
    });

    it('extracts artist from yt-dlp title format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await provider.fetchTrackInfo(
        'https://www.dailymotion.com/video/x123abc',
        'user#1234',
      );

      expect(track.artist).toBe('Test Video');
    });
  });

  describe('extractArtist edge cases', () => {
    it('returns Unknown when title has no separator', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: 'TitleWithNoArtist',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.dailymotion.com/video/x123abc',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await provider.fetchTrackInfo(
        'https://www.dailymotion.com/video/x123abc',
        'user#1234',
      );

      expect(track.artist).toBe('Unknown');
    });

    it('trims whitespace from artist name', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: '  Artist Name  - Track Title',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.dailymotion.com/video/x123abc',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await provider.fetchTrackInfo(
        'https://www.dailymotion.com/video/x123abc',
        'user#1234',
      );

      expect(track.artist).toBe('Artist Name');
    });

    it('returns Unknown in search via yt-dlp when title has no separator', async () => {
      vi.mocked(mockYtDlpService.search).mockResolvedValueOnce({
        title: 'TitleWithNoArtist',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.dailymotion.com/video/x123abc',
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.artist).toBe('Unknown');
    });
  });
});
