import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YtDlpService, YtDlpVideoInfo } from '../yt-dlp.service';
import { BandcampProvider } from './bandcamp.provider';
import { ProviderType } from './provider-types';

const mockBandcamp = vi.hoisted(() => ({
  track: { getInfo: vi.fn() },
  album: { getInfo: vi.fn() },
  search: { tracks: vi.fn() },
  shouldThrowOnConstruct: false,
}));

vi.mock('bandcamp-fetch', () => ({
  BandcampFetch: class MockBandcampFetch {
    track = mockBandcamp.track;
    album = mockBandcamp.album;
    search = mockBandcamp.search;
    constructor() {
      if (mockBandcamp.shouldThrowOnConstruct) {
        throw new Error('Init failed');
      }
    }
  },
}));

function createMockYtDlpService(
  overrides: Partial<YtDlpService> = {},
): YtDlpService {
  return {
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    getVideoInfo: vi.fn().mockResolvedValue({
      title: 'Test Track - Artist',
      duration: 180,
      thumbnail: 'https://example.com/thumb.jpg',
      url: 'https://artist.bandcamp.com/track/test-track',
    } satisfies YtDlpVideoInfo),
    getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.mp3'),
    getAudioInfo: vi.fn().mockResolvedValue({
      url: 'https://example.com/audio.mp3',
      codec: 'mp3',
      container: 'mp3',
    }),
    forceUpdate: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({
      title: 'Search Result - Artist',
      duration: 240,
      thumbnail: 'https://example.com/search-thumb.jpg',
      url: 'https://artist.bandcamp.com/track/search-result',
    } satisfies YtDlpVideoInfo),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as YtDlpService;
}

describe('BandcampProvider', () => {
  let provider: BandcampProvider;
  let mockYtDlpService: YtDlpService;

  beforeEach(() => {
    mockBandcamp.track.getInfo.mockReset();
    mockBandcamp.album.getInfo.mockReset();
    mockBandcamp.search.tracks.mockReset();
    mockBandcamp.shouldThrowOnConstruct = false;

    mockBandcamp.track.getInfo.mockRejectedValue(new Error('Not configured'));
    mockBandcamp.album.getInfo.mockRejectedValue(new Error('Not configured'));
    mockBandcamp.search.tracks.mockRejectedValue(new Error('Not configured'));

    mockYtDlpService = createMockYtDlpService();
    provider = new BandcampProvider(mockYtDlpService);
    provider.onModuleInit();
  });

  describe('canHandle', () => {
    it('returns true for bandcamp.com track URL', () => {
      expect(
        provider.canHandle('https://artist.bandcamp.com/track/song-name'),
      ).toBe(true);
    });

    it('returns true for bandcamp.com album URL', () => {
      expect(
        provider.canHandle('https://artist.bandcamp.com/album/album-name'),
      ).toBe(true);
    });

    it('returns false for non-Bandcamp URL', () => {
      expect(
        provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe(false);
    });

    it('returns false for bandcamp.com without track or album', () => {
      expect(provider.canHandle('https://artist.bandcamp.com')).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(provider.canHandle('not-a-valid-url')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('returns track info via native API when successful', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/test-track',
        name: 'Test Track',
        duration: 180,
        imageUrl: 'https://example.com/native-thumb.jpg',
        artist: { name: 'Native Artist' },
        streamUrl: 'https://example.com/stream.mp3',
      });

      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://artist.bandcamp.com/track/test-track',
        title: 'Test Track',
        duration: 180,
        thumbnail: 'https://example.com/native-thumb.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Bandcamp,
        artist: 'Native Artist',
        isLive: false,
        streamUrl: 'https://example.com/stream.mp3',
      });
      expect(track.addedAt).toBeInstanceOf(Date);
      expect(mockYtDlpService.getVideoInfo).not.toHaveBeenCalled();
    });

    it('returns track info without streamUrl when not available', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/test-track',
        name: 'Test Track',
        duration: 180,
        imageUrl: 'https://example.com/native-thumb.jpg',
        artist: { name: 'Native Artist' },
      });

      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.streamUrl).toBeUndefined();
    });

    it('returns track info via yt-dlp when native API fails', async () => {
      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://artist.bandcamp.com/track/test-track',
        title: 'Test Track - Artist',
        duration: 180,
        requestedBy: 'user#1234',
        provider: ProviderType.Bandcamp,
      });
      expect(track.addedAt).toBeInstanceOf(Date);
    });

    it('falls back to yt-dlp for album URLs (not track URLs)', async () => {
      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/album/test-album',
        'user#1234',
      );

      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalled();
      expect(mockBandcamp.track.getInfo).not.toHaveBeenCalled();
      expect(track.provider).toBe(ProviderType.Bandcamp);
    });

    it('includes artist extracted from title when using yt-dlp', async () => {
      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.artist).toBe('Test Track');
    });

    it('handles missing artist in native response', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/test-track',
        name: 'Test Track',
        duration: 180,
        imageUrl: 'https://example.com/native-thumb.jpg',
      });

      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.artist).toBe('Unknown');
    });
  });

  describe('getAudioInfo', () => {
    it('returns audio info via native API when successful', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        streamUrl: 'https://bandcamp.com/native-stream.mp3',
      });

      const audioInfo = await provider.getAudioInfo(
        'https://artist.bandcamp.com/track/test-track',
      );

      expect(audioInfo).toEqual({
        url: 'https://bandcamp.com/native-stream.mp3',
        codec: 'mp3',
        container: 'mp3',
      });
      expect(mockYtDlpService.getAudioInfo).not.toHaveBeenCalled();
    });

    it('falls back to yt-dlp when native API has no streamUrl', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({});

      const audioInfo = await provider.getAudioInfo(
        'https://artist.bandcamp.com/track/test-track',
      );

      expect(audioInfo).toEqual({
        url: 'https://example.com/audio.mp3',
        codec: 'mp3',
        container: 'mp3',
      });
      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://artist.bandcamp.com/track/test-track',
      );
    });

    it('falls back to yt-dlp when native API fails', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://artist.bandcamp.com/track/test-track',
      );

      expect(audioInfo).toEqual({
        url: 'https://example.com/audio.mp3',
        codec: 'mp3',
        container: 'mp3',
      });
      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://artist.bandcamp.com/track/test-track',
      );
    });

    it('falls back to yt-dlp for album URLs', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://artist.bandcamp.com/album/test-album',
      );

      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalled();
      expect(mockBandcamp.track.getInfo).not.toHaveBeenCalled();
      expect(audioInfo).toBeDefined();
    });
  });

  describe('search', () => {
    it('returns tracks via native API when successful', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/found-track',
            name: 'Found Track',
            imageUrl: 'https://example.com/found-thumb.jpg',
            artist: 'Search Artist',
          },
        ],
      });
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/found-track',
        name: 'Found Track Details',
        duration: 200,
        imageUrl: 'https://example.com/detail-thumb.jpg',
        artist: { name: 'Detail Artist' },
        streamUrl: 'https://example.com/stream.mp3',
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({
        url: 'https://artist.bandcamp.com/track/found-track',
        title: 'Found Track Details',
        duration: 200,
        thumbnail: 'https://example.com/detail-thumb.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Bandcamp,
        artist: 'Detail Artist',
        streamUrl: 'https://example.com/stream.mp3',
      });
      expect(mockYtDlpService.search).not.toHaveBeenCalled();
    });

    it('uses search result fallback when track.getInfo fails', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/found-track',
            name: 'Found Track',
            imageUrl: 'https://example.com/found-thumb.jpg',
            artist: 'Search Artist',
          },
        ],
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({
        url: 'https://artist.bandcamp.com/track/found-track',
        title: 'Found Track',
        duration: 0,
        thumbnail: 'https://example.com/found-thumb.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Bandcamp,
        artist: 'Search Artist',
      });
    });

    it('falls back to yt-dlp when native search returns empty', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [],
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'ytsearch1:test query bandcamp',
      );
    });

    it('falls back to yt-dlp when native search fails', async () => {
      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'ytsearch1:test query bandcamp',
      );
    });

    it('respects limit parameter', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/track1',
            name: 'Track 1',
            imageUrl: '',
            artist: 'Artist',
          },
          {
            url: 'https://artist.bandcamp.com/track/track2',
            name: 'Track 2',
            imageUrl: '',
            artist: 'Artist',
          },
          {
            url: 'https://artist.bandcamp.com/track/track3',
            name: 'Track 3',
            imageUrl: '',
            artist: 'Artist',
          },
        ],
      });
      mockBandcamp.track.getInfo.mockResolvedValue({
        url: 'https://artist.bandcamp.com/track/track',
        name: 'Track',
        duration: 180,
        imageUrl: '',
        artist: { name: 'Artist' },
      });

      const tracks = await provider.search('test query', 'user#1234', 2);

      expect(tracks).toHaveLength(2);
    });

    it('uses ytsearch with bandcamp suffix for yt-dlp search', async () => {
      await provider.search('my query', 'user#1234', 3);

      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'ytsearch3:my query bandcamp',
      );
    });

    it('handles missing artist in search items', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/found-track',
            name: 'Found Track',
            imageUrl: '',
          },
        ],
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.artist).toBe('Unknown');
    });
  });

  describe('fetchPlaylist', () => {
    it('throws error for track URL (not album)', async () => {
      await expect(
        provider.fetchPlaylist(
          'https://artist.bandcamp.com/track/test-track',
          'user#1234',
        ),
      ).rejects.toThrow('Not a Bandcamp album URL');
    });

    it('returns album tracks via native API when successful', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        imageUrl: 'https://example.com/album-art.jpg',
        artist: { name: 'Album Artist' },
        tracks: [
          {
            url: 'https://artist.bandcamp.com/track/track1',
            name: 'Track 1',
            duration: 180,
            streamUrl: 'https://example.com/stream1.mp3',
          },
          {
            url: 'https://artist.bandcamp.com/track/track2',
            name: 'Track 2',
            duration: 200,
          },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
        10,
      );

      expect(tracks).toHaveLength(2);
      expect(tracks[0]).toMatchObject({
        url: 'https://artist.bandcamp.com/track/track1',
        title: 'Track 1',
        duration: 180,
        thumbnail: 'https://example.com/album-art.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.Bandcamp,
        artist: 'Album Artist',
        streamUrl: 'https://example.com/stream1.mp3',
      });
      expect(tracks[1]?.streamUrl).toBeUndefined();
      expect(mockYtDlpService.getPlaylistTracks).not.toHaveBeenCalled();
    });

    it('falls back to yt-dlp when album has no tracks', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        imageUrl: 'https://example.com/album-art.jpg',
        artist: { name: 'Album Artist' },
        tracks: [],
      });

      vi.mocked(mockYtDlpService.getPlaylistTracks).mockResolvedValueOnce([
        {
          url: 'https://artist.bandcamp.com/track/track1',
          title: 'Track 1',
          duration: 180,
          thumbnail: '',
          requestedBy: 'user#1234',
          provider: ProviderType.Bandcamp,
          addedAt: new Date(),
        },
      ]);

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
        10,
      );

      expect(mockYtDlpService.getPlaylistTracks).toHaveBeenCalledWith(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
        10,
        ProviderType.Bandcamp,
      );
      expect(tracks).toHaveLength(1);
    });

    it('falls back to yt-dlp when native API fails', async () => {
      vi.mocked(mockYtDlpService.getPlaylistTracks).mockResolvedValueOnce([
        {
          url: 'https://artist.bandcamp.com/track/track1',
          title: 'Track 1',
          duration: 180,
          thumbnail: '',
          requestedBy: 'user#1234',
          provider: ProviderType.Bandcamp,
          addedAt: new Date(),
        },
      ]);

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
        10,
      );

      expect(mockYtDlpService.getPlaylistTracks).toHaveBeenCalledWith(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
        10,
        ProviderType.Bandcamp,
      );
      expect(tracks).toHaveLength(1);
    });

    it('respects maxTracks parameter', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        imageUrl: 'https://example.com/album-art.jpg',
        artist: { name: 'Album Artist' },
        tracks: [
          { url: 'url1', name: 'Track 1', duration: 180 },
          { url: 'url2', name: 'Track 2', duration: 180 },
          { url: 'url3', name: 'Track 3', duration: 180 },
          { url: 'url4', name: 'Track 4', duration: 180 },
          { url: 'url5', name: 'Track 5', duration: 180 },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
        3,
      );

      expect(tracks).toHaveLength(3);
    });

    it('handles missing artist in album', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        imageUrl: 'https://example.com/album-art.jpg',
        tracks: [{ url: 'url1', name: 'Track 1', duration: 180 }],
      });

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
      );

      expect(tracks[0]?.artist).toBe('Unknown');
    });
  });

  describe('name', () => {
    it('returns Bandcamp as provider name', () => {
      expect(provider.name).toBe('Bandcamp');
    });
  });

  describe('type', () => {
    it('returns correct provider type', () => {
      expect(provider.type).toBe(ProviderType.Bandcamp);
    });
  });

  describe('priority', () => {
    it('has priority of 25', () => {
      expect(provider.priority).toBe(25);
    });
  });

  describe('onModuleInit', () => {
    it('handles BandcampFetch initialization failure gracefully', () => {
      mockBandcamp.shouldThrowOnConstruct = true;

      const newProvider = new BandcampProvider(mockYtDlpService);
      expect(() => {
        newProvider.onModuleInit();
      }).not.toThrow();

      mockBandcamp.shouldThrowOnConstruct = false;
    });
  });

  describe('when native client initialization fails', () => {
    let providerWithoutNativeClient: BandcampProvider;

    beforeEach(() => {
      mockBandcamp.shouldThrowOnConstruct = true;
      providerWithoutNativeClient = new BandcampProvider(mockYtDlpService);
      providerWithoutNativeClient.onModuleInit();
      mockBandcamp.shouldThrowOnConstruct = false;
    });

    describe('fetchTrackInfo', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        const track = await providerWithoutNativeClient.fetchTrackInfo(
          'https://artist.bandcamp.com/track/test-track',
          'user#1234',
        );

        expect(track).toMatchObject({
          url: 'https://artist.bandcamp.com/track/test-track',
          title: 'Test Track - Artist',
          duration: 180,
          requestedBy: 'user#1234',
          provider: ProviderType.Bandcamp,
          artist: 'Test Track',
        });
        expect(mockYtDlpService.getVideoInfo).toHaveBeenCalledWith(
          'https://artist.bandcamp.com/track/test-track',
        );
        expect(mockBandcamp.track.getInfo).not.toHaveBeenCalled();
      });
    });

    describe('getAudioInfo', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        const audioInfo = await providerWithoutNativeClient.getAudioInfo(
          'https://artist.bandcamp.com/track/test-track',
        );

        expect(audioInfo).toEqual({
          url: 'https://example.com/audio.mp3',
          codec: 'mp3',
          container: 'mp3',
        });
        expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
          'https://artist.bandcamp.com/track/test-track',
        );
        expect(mockBandcamp.track.getInfo).not.toHaveBeenCalled();
      });
    });

    describe('search', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        const tracks = await providerWithoutNativeClient.search(
          'test query',
          'user#1234',
          3,
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
          url: 'https://artist.bandcamp.com/track/search-result',
          title: 'Search Result - Artist',
          duration: 240,
          requestedBy: 'user#1234',
          provider: ProviderType.Bandcamp,
          artist: 'Search Result',
        });
        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'ytsearch3:test query bandcamp',
        );
        expect(mockBandcamp.search.tracks).not.toHaveBeenCalled();
      });
    });

    describe('fetchPlaylist', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        vi.mocked(mockYtDlpService.getPlaylistTracks).mockResolvedValueOnce([
          {
            url: 'https://artist.bandcamp.com/track/track1',
            title: 'Track 1',
            duration: 180,
            thumbnail: '',
            requestedBy: 'user#1234',
            provider: ProviderType.Bandcamp,
            addedAt: new Date(),
          },
        ]);

        const tracks = await providerWithoutNativeClient.fetchPlaylist(
          'https://artist.bandcamp.com/album/my-album',
          'user#1234',
          20,
        );

        expect(tracks).toHaveLength(1);
        expect(mockYtDlpService.getPlaylistTracks).toHaveBeenCalledWith(
          'https://artist.bandcamp.com/album/my-album',
          'user#1234',
          20,
          ProviderType.Bandcamp,
        );
        expect(mockBandcamp.album.getInfo).not.toHaveBeenCalled();
      });
    });
  });

  describe('fetchPlaylist edge cases', () => {
    it('handles album tracks without url property', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        imageUrl: 'https://example.com/album-art.jpg',
        artist: { name: 'Album Artist' },
        tracks: [
          {
            name: 'Track Without URL',
            duration: 180,
          },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
      );

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.url).toBe('https://artist.bandcamp.com/album/my-album');
    });

    it('handles album without imageUrl property', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        artist: { name: 'Album Artist' },
        tracks: [
          {
            url: 'https://artist.bandcamp.com/track/track1',
            name: 'Track 1',
            duration: 180,
          },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
      );

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.thumbnail).toBe('');
    });

    it('handles album tracks without duration', async () => {
      mockBandcamp.album.getInfo.mockResolvedValueOnce({
        imageUrl: 'https://example.com/album-art.jpg',
        artist: { name: 'Album Artist' },
        tracks: [
          {
            url: 'https://artist.bandcamp.com/track/track1',
            name: 'Track 1',
          },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://artist.bandcamp.com/album/my-album',
        'user#1234',
      );

      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.duration).toBe(0);
    });
  });

  describe('fetchTrackInfo edge cases', () => {
    it('handles track without url property', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        name: 'Test Track',
        duration: 180,
        imageUrl: 'https://example.com/native-thumb.jpg',
        artist: { name: 'Native Artist' },
      });

      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.url).toBe('https://artist.bandcamp.com/track/test-track');
    });

    it('handles track without imageUrl property', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/test-track',
        name: 'Test Track',
        duration: 180,
        artist: { name: 'Native Artist' },
      });

      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.thumbnail).toBe('');
    });

    it('handles track without duration property', async () => {
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/test-track',
        name: 'Test Track',
        imageUrl: 'https://example.com/native-thumb.jpg',
        artist: { name: 'Native Artist' },
      });

      const track = await provider.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.duration).toBe(0);
    });
  });

  describe('search edge cases', () => {
    it('handles search result track without url property', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/found-track',
            name: 'Found Track',
            imageUrl: 'https://example.com/found-thumb.jpg',
            artist: 'Search Artist',
          },
        ],
      });
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        name: 'Found Track Details',
        duration: 200,
        imageUrl: 'https://example.com/detail-thumb.jpg',
        artist: { name: 'Detail Artist' },
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.url).toBe(
        'https://artist.bandcamp.com/track/found-track',
      );
    });

    it('handles search result track without artist in both track info and item', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/found-track',
            name: 'Found Track',
            imageUrl: 'https://example.com/found-thumb.jpg',
          },
        ],
      });
      mockBandcamp.track.getInfo.mockResolvedValueOnce({
        url: 'https://artist.bandcamp.com/track/found-track',
        name: 'Found Track Details',
        duration: 200,
        imageUrl: 'https://example.com/detail-thumb.jpg',
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.artist).toBe('Unknown');
    });

    it('handles search item without imageUrl in fallback', async () => {
      mockBandcamp.search.tracks.mockResolvedValueOnce({
        items: [
          {
            url: 'https://artist.bandcamp.com/track/found-track',
            name: 'Found Track',
            artist: 'Search Artist',
          },
        ],
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks[0]?.thumbnail).toBe('');
    });
  });

  describe('extractArtist edge cases', () => {
    it('returns Unknown when title has no separator', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: 'TitleWithNoArtist',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://artist.bandcamp.com/track/test-track',
      });

      mockBandcamp.shouldThrowOnConstruct = true;
      const providerWithoutNative = new BandcampProvider(mockYtDlpService);
      providerWithoutNative.onModuleInit();
      mockBandcamp.shouldThrowOnConstruct = false;

      const track = await providerWithoutNative.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.artist).toBe('Unknown');
    });

    it('trims whitespace from artist name', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: '  Artist Name  - Track Title',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://artist.bandcamp.com/track/test-track',
      });

      mockBandcamp.shouldThrowOnConstruct = true;
      const providerWithoutNative = new BandcampProvider(mockYtDlpService);
      providerWithoutNative.onModuleInit();
      mockBandcamp.shouldThrowOnConstruct = false;

      const track = await providerWithoutNative.fetchTrackInfo(
        'https://artist.bandcamp.com/track/test-track',
        'user#1234',
      );

      expect(track.artist).toBe('Artist Name');
    });
  });
});
