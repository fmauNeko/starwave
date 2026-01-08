import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YtDlpService, YtDlpVideoInfo } from '../yt-dlp.service';
import { ProviderType } from './provider-types';
import { SoundCloudProvider } from './soundcloud.provider';

const mockSoundCloud = vi.hoisted(() => ({
  tracks: {
    get: vi.fn(),
    search: vi.fn(),
  },
  playlists: {
    get: vi.fn(),
  },
  util: {
    streamLink: vi.fn(),
  },
  shouldThrowOnConstruct: false,
}));

vi.mock('soundcloud.ts', () => ({
  default: class MockSoundCloud {
    tracks = mockSoundCloud.tracks;
    playlists = mockSoundCloud.playlists;
    util = mockSoundCloud.util;
    constructor() {
      if (mockSoundCloud.shouldThrowOnConstruct) {
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
      url: 'https://soundcloud.com/artist/track',
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
      url: 'https://soundcloud.com/artist/search-result',
    } satisfies YtDlpVideoInfo),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as YtDlpService;
}

describe('SoundCloudProvider', () => {
  let provider: SoundCloudProvider;
  let mockYtDlpService: YtDlpService;

  beforeEach(() => {
    mockSoundCloud.tracks.get.mockReset();
    mockSoundCloud.tracks.search.mockReset();
    mockSoundCloud.playlists.get.mockReset();
    mockSoundCloud.util.streamLink.mockReset();
    mockSoundCloud.shouldThrowOnConstruct = false;

    mockSoundCloud.tracks.get.mockRejectedValue(new Error('Not configured'));
    mockSoundCloud.tracks.search.mockRejectedValue(new Error('Not configured'));
    mockSoundCloud.playlists.get.mockRejectedValue(new Error('Not configured'));
    mockSoundCloud.util.streamLink.mockRejectedValue(
      new Error('Not configured'),
    );

    mockYtDlpService = createMockYtDlpService();
    provider = new SoundCloudProvider(mockYtDlpService);
    provider.onModuleInit();
  });

  describe('canHandle', () => {
    it('returns true for soundcloud.com URL', () => {
      expect(
        provider.canHandle('https://soundcloud.com/artist/track-name'),
      ).toBe(true);
    });

    it('returns true for snd.sc short URL', () => {
      expect(provider.canHandle('https://snd.sc/artist/track-name')).toBe(true);
    });

    it('returns true for soundcloud.com/sets playlist URL', () => {
      expect(
        provider.canHandle('https://soundcloud.com/artist/sets/playlist-name'),
      ).toBe(true);
    });

    it('returns false for non-SoundCloud URL', () => {
      expect(
        provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(provider.canHandle('not-a-valid-url')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('returns track info via native API when successful', async () => {
      mockSoundCloud.tracks.get.mockResolvedValueOnce({
        permalink_url: 'https://soundcloud.com/artist/test-track',
        title: 'Test Track',
        full_duration: 180000,
        artwork_url: 'https://soundcloud.com/art-large.jpg',
        user: { username: 'Test Artist' },
      });

      const track = await provider.fetchTrackInfo(
        'https://soundcloud.com/artist/track',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://soundcloud.com/artist/test-track',
        title: 'Test Track',
        duration: 180,
        thumbnail: 'https://soundcloud.com/art-t500x500.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.SoundCloud,
        artist: 'Test Artist',
        isLive: false,
      });
      expect(track.addedAt).toBeInstanceOf(Date);
      expect(mockYtDlpService.getVideoInfo).not.toHaveBeenCalled();
    });

    it('returns track info via yt-dlp when native API fails', async () => {
      const track = await provider.fetchTrackInfo(
        'https://soundcloud.com/artist/track',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://soundcloud.com/artist/track',
        title: 'Test Track - Artist',
        duration: 180,
        requestedBy: 'user#1234',
        provider: ProviderType.SoundCloud,
      });
      expect(track.addedAt).toBeInstanceOf(Date);
      expect(mockYtDlpService.getVideoInfo).toHaveBeenCalled();
    });

    it('includes artist extracted from title when using yt-dlp', async () => {
      const track = await provider.fetchTrackInfo(
        'https://soundcloud.com/artist/track',
        'user#1234',
      );

      expect(track.artist).toBe('Test Track');
    });

    it('sets isLive to true for zero duration tracks', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: 'Live Stream',
        duration: 0,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://soundcloud.com/artist/live',
      });

      const track = await provider.fetchTrackInfo(
        'https://soundcloud.com/artist/live',
        'user#1234',
      );

      expect(track.isLive).toBe(true);
    });
  });

  describe('getAudioInfo', () => {
    it('returns audio info via native API when successful', async () => {
      const mockTrackData = {
        permalink_url: 'https://soundcloud.com/artist/track',
        title: 'Track',
        full_duration: 180000,
        artwork_url: 'https://soundcloud.com/art.jpg',
        user: { username: 'Artist' },
      };
      mockSoundCloud.tracks.get.mockResolvedValueOnce(mockTrackData);
      mockSoundCloud.util.streamLink.mockResolvedValueOnce(
        'https://soundcloud.com/native-stream.mp3',
      );

      const audioInfo = await provider.getAudioInfo(
        'https://soundcloud.com/artist/track',
      );

      expect(audioInfo).toEqual({
        url: 'https://soundcloud.com/native-stream.mp3',
        codec: 'aac',
        container: 'hls',
      });
      expect(mockYtDlpService.getAudioInfo).not.toHaveBeenCalled();
    });

    it('falls back to yt-dlp when native API fails', async () => {
      const audioInfo = await provider.getAudioInfo(
        'https://soundcloud.com/artist/track',
      );

      expect(audioInfo).toEqual({
        url: 'https://example.com/audio.mp3',
        codec: 'mp3',
        container: 'mp3',
      });
      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
        'https://soundcloud.com/artist/track',
      );
    });

    it('falls back to yt-dlp when streamLink fails', async () => {
      mockSoundCloud.tracks.get.mockResolvedValueOnce({
        permalink_url: 'https://soundcloud.com/artist/track',
      });

      const audioInfo = await provider.getAudioInfo(
        'https://soundcloud.com/artist/track',
      );

      expect(mockYtDlpService.getAudioInfo).toHaveBeenCalled();
      expect(audioInfo).toBeDefined();
    });
  });

  describe('search', () => {
    it('returns tracks via native API when successful', async () => {
      mockSoundCloud.tracks.search.mockResolvedValueOnce({
        collection: [
          {
            permalink_url: 'https://soundcloud.com/artist/found-track',
            title: 'Found Track',
            full_duration: 200000,
            artwork_url: 'https://soundcloud.com/art-large.jpg',
            user: { username: 'Search Artist' },
          },
        ],
      });

      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({
        url: 'https://soundcloud.com/artist/found-track',
        title: 'Found Track',
        duration: 200,
        thumbnail: 'https://soundcloud.com/art-t500x500.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.SoundCloud,
        artist: 'Search Artist',
      });
      expect(mockYtDlpService.search).not.toHaveBeenCalled();
    });

    it('passes correct parameters to native search', async () => {
      mockSoundCloud.tracks.search.mockResolvedValueOnce({
        collection: [],
      });

      await provider.search('my query', 'user#1234', 5);

      expect(mockSoundCloud.tracks.search).toHaveBeenCalledWith({
        q: 'my query',
        limit: 5,
      });
    });

    it('falls back to yt-dlp when native search fails', async () => {
      const tracks = await provider.search('test query', 'user#1234');

      expect(tracks).toHaveLength(1);
      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'scsearch1:test query',
      );
    });

    it('uses scsearch prefix for yt-dlp search', async () => {
      await provider.search('my query', 'user#1234', 5);

      expect(mockYtDlpService.search).toHaveBeenCalledWith(
        'scsearch5:my query',
      );
    });

    it('returns multiple tracks from native search', async () => {
      mockSoundCloud.tracks.search.mockResolvedValueOnce({
        collection: [
          {
            permalink_url: 'https://soundcloud.com/artist/track1',
            title: 'Track 1',
            full_duration: 180000,
            artwork_url: 'https://soundcloud.com/art1-large.jpg',
            user: { username: 'Artist 1' },
          },
          {
            permalink_url: 'https://soundcloud.com/artist/track2',
            title: 'Track 2',
            full_duration: 200000,
            artwork_url: 'https://soundcloud.com/art2-large.jpg',
            user: { username: 'Artist 2' },
          },
        ],
      });

      const tracks = await provider.search('test query', 'user#1234', 2);

      expect(tracks).toHaveLength(2);
      expect(tracks[0]?.title).toBe('Track 1');
      expect(tracks[1]?.title).toBe('Track 2');
    });
  });

  describe('fetchPlaylist', () => {
    it('throws error for non-playlist URL', async () => {
      await expect(
        provider.fetchPlaylist(
          'https://soundcloud.com/artist/track',
          'user#1234',
        ),
      ).rejects.toThrow('Not a SoundCloud playlist URL');
    });

    it('returns playlist tracks via native API when successful', async () => {
      mockSoundCloud.playlists.get.mockResolvedValueOnce({
        tracks: [
          {
            permalink_url: 'https://soundcloud.com/artist/track1',
            title: 'Playlist Track 1',
            full_duration: 180000,
            artwork_url: 'https://soundcloud.com/art1-large.jpg',
            user: { username: 'Playlist Artist' },
          },
          {
            permalink_url: 'https://soundcloud.com/artist/track2',
            title: 'Playlist Track 2',
            full_duration: 200000,
            artwork_url: 'https://soundcloud.com/art2-large.jpg',
            user: { username: 'Playlist Artist' },
          },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://soundcloud.com/artist/sets/my-playlist',
        'user#1234',
        10,
      );

      expect(tracks).toHaveLength(2);
      expect(tracks[0]).toMatchObject({
        url: 'https://soundcloud.com/artist/track1',
        title: 'Playlist Track 1',
        duration: 180,
        thumbnail: 'https://soundcloud.com/art1-t500x500.jpg',
        requestedBy: 'user#1234',
        provider: ProviderType.SoundCloud,
        artist: 'Playlist Artist',
      });
      expect(mockYtDlpService.getPlaylistTracks).not.toHaveBeenCalled();
    });

    it('respects maxTracks parameter', async () => {
      mockSoundCloud.playlists.get.mockResolvedValueOnce({
        tracks: [
          {
            permalink_url: 'url1',
            title: 'Track 1',
            full_duration: 180000,
            artwork_url: 'art1-large.jpg',
            user: { username: 'Artist' },
          },
          {
            permalink_url: 'url2',
            title: 'Track 2',
            full_duration: 180000,
            artwork_url: 'art2-large.jpg',
            user: { username: 'Artist' },
          },
          {
            permalink_url: 'url3',
            title: 'Track 3',
            full_duration: 180000,
            artwork_url: 'art3-large.jpg',
            user: { username: 'Artist' },
          },
        ],
      });

      const tracks = await provider.fetchPlaylist(
        'https://soundcloud.com/artist/sets/my-playlist',
        'user#1234',
        2,
      );

      expect(tracks).toHaveLength(2);
    });

    it('falls back to yt-dlp when native API fails', async () => {
      vi.mocked(mockYtDlpService.getPlaylistTracks).mockResolvedValueOnce([
        {
          url: 'https://soundcloud.com/artist/track1',
          title: 'Track 1',
          duration: 180,
          thumbnail: '',
          requestedBy: 'user#1234',
          provider: ProviderType.SoundCloud,
          addedAt: new Date(),
        },
      ]);

      const tracks = await provider.fetchPlaylist(
        'https://soundcloud.com/artist/sets/my-playlist',
        'user#1234',
        10,
      );

      expect(mockYtDlpService.getPlaylistTracks).toHaveBeenCalledWith(
        'https://soundcloud.com/artist/sets/my-playlist',
        'user#1234',
        10,
        ProviderType.SoundCloud,
      );
      expect(tracks).toHaveLength(1);
    });
  });

  describe('name', () => {
    it('returns SoundCloud as provider name', () => {
      expect(provider.name).toBe('SoundCloud');
    });
  });

  describe('type', () => {
    it('returns correct provider type', () => {
      expect(provider.type).toBe(ProviderType.SoundCloud);
    });
  });

  describe('priority', () => {
    it('has priority of 20', () => {
      expect(provider.priority).toBe(20);
    });
  });

  describe('onModuleInit', () => {
    it('handles SoundCloud initialization failure gracefully', () => {
      mockSoundCloud.shouldThrowOnConstruct = true;

      const newProvider = new SoundCloudProvider(mockYtDlpService);
      expect(() => {
        newProvider.onModuleInit();
      }).not.toThrow();

      mockSoundCloud.shouldThrowOnConstruct = false;
    });
  });

  describe('when native client initialization fails', () => {
    let providerWithoutNativeClient: SoundCloudProvider;

    beforeEach(() => {
      mockSoundCloud.shouldThrowOnConstruct = true;
      providerWithoutNativeClient = new SoundCloudProvider(mockYtDlpService);
      providerWithoutNativeClient.onModuleInit();
      mockSoundCloud.shouldThrowOnConstruct = false;
    });

    describe('fetchTrackInfo', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        const track = await providerWithoutNativeClient.fetchTrackInfo(
          'https://soundcloud.com/artist/track',
          'user#1234',
        );

        expect(track).toMatchObject({
          url: 'https://soundcloud.com/artist/track',
          title: 'Test Track - Artist',
          duration: 180,
          requestedBy: 'user#1234',
          provider: ProviderType.SoundCloud,
          artist: 'Test Track',
        });
        expect(mockYtDlpService.getVideoInfo).toHaveBeenCalledWith(
          'https://soundcloud.com/artist/track',
        );
        expect(mockSoundCloud.tracks.get).not.toHaveBeenCalled();
      });
    });

    describe('getAudioInfo', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        const audioInfo = await providerWithoutNativeClient.getAudioInfo(
          'https://soundcloud.com/artist/track',
        );

        expect(audioInfo).toEqual({
          url: 'https://example.com/audio.mp3',
          codec: 'mp3',
          container: 'mp3',
        });
        expect(mockYtDlpService.getAudioInfo).toHaveBeenCalledWith(
          'https://soundcloud.com/artist/track',
        );
        expect(mockSoundCloud.tracks.get).not.toHaveBeenCalled();
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
          url: 'https://soundcloud.com/artist/search-result',
          title: 'Search Result - Artist',
          duration: 240,
          requestedBy: 'user#1234',
          provider: ProviderType.SoundCloud,
          artist: 'Search Result',
        });
        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'scsearch3:test query',
        );
        expect(mockSoundCloud.tracks.search).not.toHaveBeenCalled();
      });
    });

    describe('fetchPlaylist', () => {
      it('uses yt-dlp directly when native client is null', async () => {
        vi.mocked(mockYtDlpService.getPlaylistTracks).mockResolvedValueOnce([
          {
            url: 'https://soundcloud.com/artist/track1',
            title: 'Track 1',
            duration: 180,
            thumbnail: '',
            requestedBy: 'user#1234',
            provider: ProviderType.SoundCloud,
            addedAt: new Date(),
          },
        ]);

        const tracks = await providerWithoutNativeClient.fetchPlaylist(
          'https://soundcloud.com/artist/sets/my-playlist',
          'user#1234',
          20,
        );

        expect(tracks).toHaveLength(1);
        expect(mockYtDlpService.getPlaylistTracks).toHaveBeenCalledWith(
          'https://soundcloud.com/artist/sets/my-playlist',
          'user#1234',
          20,
          ProviderType.SoundCloud,
        );
        expect(mockSoundCloud.playlists.get).not.toHaveBeenCalled();
      });
    });
  });

  describe('extractArtist edge cases', () => {
    it('returns Unknown when title has no separator', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: 'TitleWithNoArtist',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://soundcloud.com/artist/track',
      });

      mockSoundCloud.shouldThrowOnConstruct = true;
      const providerWithoutNative = new SoundCloudProvider(mockYtDlpService);
      providerWithoutNative.onModuleInit();
      mockSoundCloud.shouldThrowOnConstruct = false;

      const track = await providerWithoutNative.fetchTrackInfo(
        'https://soundcloud.com/artist/track',
        'user#1234',
      );

      expect(track.artist).toBe('Unknown');
    });

    it('trims whitespace from artist name', async () => {
      vi.mocked(mockYtDlpService.getVideoInfo).mockResolvedValueOnce({
        title: '  Artist Name  - Track Title',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://soundcloud.com/artist/track',
      });

      mockSoundCloud.shouldThrowOnConstruct = true;
      const providerWithoutNative = new SoundCloudProvider(mockYtDlpService);
      providerWithoutNative.onModuleInit();
      mockSoundCloud.shouldThrowOnConstruct = false;

      const track = await providerWithoutNative.fetchTrackInfo(
        'https://soundcloud.com/artist/track',
        'user#1234',
      );

      expect(track.artist).toBe('Artist Name');
    });
  });
});
