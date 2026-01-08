import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YtDlpService, YtDlpVideoInfo } from '../yt-dlp.service';
import { ProviderType } from './provider-types';
import { VimeoProvider } from './vimeo.provider';

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
      url: 'https://vimeo.com/123456789',
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
      url: 'https://vimeo.com/987654321',
    } satisfies YtDlpVideoInfo),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as YtDlpService;
}

describe('VimeoProvider', () => {
  let provider: VimeoProvider;
  let mockYtDlpService: YtDlpService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockYtDlpService = createMockYtDlpService();
    provider = new VimeoProvider(mockYtDlpService);
  });

  describe('canHandle', () => {
    it('returns true for vimeo.com URL', () => {
      expect(provider.canHandle('https://vimeo.com/123456789')).toBe(true);
    });

    it('returns true for www.vimeo.com URL', () => {
      expect(provider.canHandle('https://www.vimeo.com/123456789')).toBe(true);
    });

    it('returns true for player.vimeo.com URL', () => {
      expect(
        provider.canHandle('https://player.vimeo.com/video/123456789'),
      ).toBe(true);
    });

    it('returns false for non-Vimeo URL', () => {
      expect(
        provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(provider.canHandle('not-a-valid-url')).toBe(false);
    });

    it('returns false for vimeo.com without video ID', () => {
      expect(provider.canHandle('https://vimeo.com/about')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('returns track info from oEmbed API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            title: 'Amazing Video',
            duration: 180,
            thumbnail_url: 'https://vimeo.com/thumb.jpg',
            author_name: 'Video Creator',
            video_id: 123456789,
          }),
      });

      const track = await provider.fetchTrackInfo(
        'https://vimeo.com/123456789',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://vimeo.com/123456789',
        title: 'Amazing Video',
        duration: 180,
        thumbnail: 'https://vimeo.com/thumb.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Vimeo,
        artist: 'Video Creator',
        isLive: false,
      });
      expect(track.addedAt).toBeInstanceOf(Date);
    });

    it('falls back to yt-dlp when oEmbed fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await provider.fetchTrackInfo(
        'https://vimeo.com/123456789',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://vimeo.com/123456789',
        title: 'Test Video - Creator',
        duration: 300,
        requestedBy: 'user#1234',
        provider: ProviderType.Vimeo,
      });
      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalled();
    });
  });

  describe('getAudioInfo', () => {
    it('always uses yt-dlp for audio streaming', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://vimeo.com/123456789',
      );

      expect(audioInfo).toEqual({
        url: 'https://example.com/audio.mp3',
        codec: 'aac',
        container: 'mp4',
      });
      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://vimeo.com/123456789',
      );
    });
  });

  describe('search', () => {
    it('returns tracks via yt-dlp with vimeo site filter', async () => {
      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({
        url: 'https://vimeo.com/987654321',
        title: 'Search Result - Creator',
        duration: 240,
        requestedBy: 'user#1234',
        provider: ProviderType.Vimeo,
      });
    });

    it('uses ytsearch with vimeo site filter', async () => {
      await provider.search('my query', 'user#1234', 3);

      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'ytsearch3:my query site:vimeo.com',
      );
    });

    it('extracts artist from title', async () => {
      const tracks = await provider.search('test', 'user#1234');

      expect(tracks[0]?.artist).toBe('Search Result');
    });
  });

  describe('name', () => {
    it('returns Vimeo as provider name', () => {
      expect(provider.name).toBe('Vimeo');
    });
  });

  describe('type', () => {
    it('returns correct provider type', () => {
      expect(provider.type).toBe(ProviderType.Vimeo);
    });
  });

  describe('priority', () => {
    it('has priority of 30', () => {
      expect(provider.priority).toBe(30);
    });
  });

  describe('extractArtist edge cases', () => {
    it('returns Unknown when title has no separator', async () => {
      vi.mocked(mockYtDlpService.search).mockResolvedValueOnce({
        title: 'TitleWithNoArtist',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://vimeo.com/123456789',
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.artist).toBe('Unknown');
    });

    it('trims whitespace from artist name', async () => {
      vi.mocked(mockYtDlpService.search).mockResolvedValueOnce({
        title: '  Artist Name  - Track Title',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://vimeo.com/123456789',
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.artist).toBe('Artist Name');
    });

    it('returns Unknown in yt-dlp fallback when title has no separator', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: 'TitleWithNoArtist',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://vimeo.com/123456789',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await provider.fetchTrackInfo(
        'https://vimeo.com/123456789',
        'user#1234',
      );

      expect(track.artist).toBe('Unknown');
    });
  });
});
