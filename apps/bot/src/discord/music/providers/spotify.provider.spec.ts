import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../../config/config.type';
import type { YtDlpService, YtDlpVideoInfo } from '../yt-dlp.service';
import { ProviderType } from './provider-types';
import { SpotifyProvider } from './spotify.provider';

const {
  mockSpotifyTracksGet,
  mockSpotifySearch,
  mockSpotifyPlaylistsGetItems,
  mockSpotifyAlbumsGet,
  mockWithClientCredentials,
} = vi.hoisted(() => {
  const tracksGet = vi.fn();
  const search = vi.fn();
  const playlistsGetItems = vi.fn();
  const albumsGet = vi.fn();

  const withClientCredentials = vi.fn().mockReturnValue({
    tracks: {
      get: tracksGet,
    },
    search: search,
    playlists: {
      getPlaylistItems: playlistsGetItems,
    },
    albums: {
      get: albumsGet,
    },
  });

  return {
    mockSpotifyTracksGet: tracksGet,
    mockSpotifySearch: search,
    mockSpotifyPlaylistsGetItems: playlistsGetItems,
    mockSpotifyAlbumsGet: albumsGet,
    mockWithClientCredentials: withClientCredentials,
  };
});

vi.mock('@spotify/web-api-ts-sdk', () => ({
  SpotifyApi: {
    withClientCredentials: mockWithClientCredentials,
  },
}));

function createMockYtDlpService(
  overrides: Partial<YtDlpService> = {},
): YtDlpService {
  return {
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    getVideoInfo: vi.fn().mockResolvedValue({
      title: 'Test Artist - Test Song',
      duration: 180,
      thumbnail: 'https://youtube.com/thumb.jpg',
      url: 'https://www.youtube.com/watch?v=abc123',
    } satisfies YtDlpVideoInfo),
    getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.webm'),
    getAudioInfo: vi.fn().mockResolvedValue({
      url: 'https://example.com/audio.webm',
      codec: 'opus',
      container: 'webm',
    }),
    forceUpdate: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({
      title: 'Test Artist - Test Song',
      duration: 180,
      thumbnail: 'https://youtube.com/search-thumb.jpg',
      url: 'https://www.youtube.com/watch?v=xyz789',
    } satisfies YtDlpVideoInfo),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as YtDlpService;
}

function createMockConfigService(
  spotifyConfig?: { clientId: string; clientSecret: string } | null,
): ConfigService<Config> {
  return {
    get: vi.fn((key: string) => {
      if (key === 'spotify') {
        return spotifyConfig;
      }
      return undefined;
    }),
  } as unknown as ConfigService<Config>;
}

describe('SpotifyProvider', () => {
  let provider: SpotifyProvider;
  let mockYtDlpService: YtDlpService;
  let mockConfigService: ConfigService<Config>;

  describe('with Spotify credentials configured', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockYtDlpService = createMockYtDlpService();
      mockConfigService = createMockConfigService({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
      provider = new SpotifyProvider(mockYtDlpService, mockConfigService);

      mockSpotifyTracksGet.mockResolvedValue({
        name: 'Test Song',
        duration_ms: 180000,
        artists: [{ name: 'Test Artist' }],
        album: {
          images: [{ url: 'https://spotify.com/album-art.jpg' }],
        },
      });

      mockSpotifySearch.mockResolvedValue({
        tracks: {
          items: [
            {
              name: 'Found Song',
              duration_ms: 240000,
              artists: [{ name: 'Found Artist' }],
              album: {
                images: [{ url: 'https://spotify.com/found-art.jpg' }],
              },
            },
          ],
        },
      });

      mockSpotifyPlaylistsGetItems.mockResolvedValue({
        items: [
          {
            track: {
              type: 'track',
              name: 'Playlist Track',
              duration_ms: 200000,
              artists: [{ name: 'Playlist Artist' }],
              album: {
                images: [{ url: 'https://spotify.com/playlist-art.jpg' }],
              },
            },
          },
        ],
      });

      mockSpotifyAlbumsGet.mockResolvedValue({
        images: [{ url: 'https://spotify.com/album-art.jpg' }],
        tracks: {
          items: [
            {
              name: 'Album Track',
              duration_ms: 190000,
              artists: [{ name: 'Album Artist' }],
            },
          ],
        },
      });

      provider.onModuleInit();
    });

    describe('canHandle', () => {
      it('returns true for spotify.com track URL', () => {
        expect(
          provider.canHandle('https://open.spotify.com/track/abc123xyz'),
        ).toBe(true);
      });

      it('returns true for spotify.com playlist URL', () => {
        expect(
          provider.canHandle('https://open.spotify.com/playlist/abc123xyz'),
        ).toBe(true);
      });

      it('returns true for spotify.com album URL', () => {
        expect(
          provider.canHandle('https://open.spotify.com/album/abc123xyz'),
        ).toBe(true);
      });

      it('returns false for non-Spotify URL', () => {
        expect(
          provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
        ).toBe(false);
      });

      it('returns false for invalid URL', () => {
        expect(provider.canHandle('not-a-valid-url')).toBe(false);
      });
    });

    describe('fetchTrackInfo', () => {
      it('fetches Spotify metadata and resolves to YouTube', async () => {
        const track = await provider.fetchTrackInfo(
          'https://open.spotify.com/track/abc123',
          'user#1234',
        );

        expect(track).toMatchObject({
          url: 'https://www.youtube.com/watch?v=xyz789',
          title: 'Test Song',
          duration: 180,
          thumbnail: 'https://spotify.com/album-art.jpg',
          requestedBy: 'user#1234',
          provider: ProviderType.Spotify,
          artist: 'Test Artist',
          isLive: false,
        });
        expect(track.addedAt).toBeInstanceOf(Date);
      });

      it('uses yt-dlp to search for matching YouTube video', async () => {
        await provider.fetchTrackInfo(
          'https://open.spotify.com/track/abc123',
          'user#1234',
        );

        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'ytsearch1:Test Artist - Test Song',
        );
      });

      it('throws error for invalid track URL', async () => {
        await expect(
          provider.fetchTrackInfo(
            'https://open.spotify.com/playlist/abc123',
            'user#1234',
          ),
        ).rejects.toThrow('Invalid Spotify track URL');
      });

      it('handles tracks with multiple artists', async () => {
        mockSpotifyTracksGet.mockResolvedValue({
          name: 'Collab Song',
          duration_ms: 200000,
          artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
          album: {
            images: [{ url: 'https://spotify.com/collab-art.jpg' }],
          },
        });

        const track = await provider.fetchTrackInfo(
          'https://open.spotify.com/track/collab123',
          'user#1234',
        );

        expect(track.artist).toBe('Artist A, Artist B');
        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'ytsearch1:Artist A, Artist B - Collab Song',
        );
      });

      it('handles tracks with no album images', async () => {
        mockSpotifyTracksGet.mockResolvedValue({
          name: 'No Art Song',
          duration_ms: 180000,
          artists: [{ name: 'Artist' }],
          album: {
            images: [],
          },
        });

        const track = await provider.fetchTrackInfo(
          'https://open.spotify.com/track/noart123',
          'user#1234',
        );

        expect(track.thumbnail).toBe('');
      });
    });

    describe('getAudioInfo', () => {
      it('resolves Spotify track to YouTube audio', async () => {
        const audioInfo = await provider.getAudioInfo(
          'https://open.spotify.com/track/abc123',
        );

        expect(audioInfo).toEqual({
          url: 'https://example.com/audio.webm',
          codec: 'opus',
          container: 'webm',
        });
        expect(mockYtDlpService.search).toHaveBeenCalled();
        expect(mockYtDlpService.getAudioInfo).toHaveBeenCalled();
      });

      it('throws error for invalid track URL', async () => {
        await expect(
          provider.getAudioInfo('https://open.spotify.com/playlist/abc123'),
        ).rejects.toThrow('Invalid Spotify track URL');
      });
    });

    describe('search', () => {
      it('searches Spotify and resolves tracks to YouTube', async () => {
        const tracks = await provider.search('test query', 'user#1234');

        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
          url: 'https://www.youtube.com/watch?v=xyz789',
          title: 'Found Song',
          duration: 240,
          thumbnail: 'https://spotify.com/found-art.jpg',
          requestedBy: 'user#1234',
          provider: ProviderType.Spotify,
          artist: 'Found Artist',
        });
      });

      it('falls back to YouTube when Spotify search returns empty', async () => {
        mockSpotifySearch.mockResolvedValue({
          tracks: {
            items: [],
          },
        });

        const tracks = await provider.search('test query', 'user#1234');

        expect(tracks).toHaveLength(1);
        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'ytsearch1:test query',
        );
      });

      it('falls back to YouTube when Spotify search fails', async () => {
        mockSpotifySearch.mockRejectedValue(new Error('API Error'));

        const tracks = await provider.search('test query', 'user#1234');

        expect(tracks).toHaveLength(1);
        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'ytsearch1:test query',
        );
      });

      it('skips tracks when YouTube match fails', async () => {
        mockSpotifySearch.mockResolvedValue({
          tracks: {
            items: [
              {
                name: 'Song 1',
                duration_ms: 180000,
                artists: [{ name: 'Artist 1' }],
                album: { images: [{ url: 'art1.jpg' }] },
              },
              {
                name: 'Song 2',
                duration_ms: 200000,
                artists: [{ name: 'Artist 2' }],
                album: { images: [{ url: 'art2.jpg' }] },
              },
            ],
          },
        });

        vi.mocked(mockYtDlpService.search)
          .mockResolvedValueOnce({
            title: 'Artist 1 - Song 1',
            duration: 180,
            thumbnail: 'thumb1.jpg',
            url: 'https://youtube.com/watch?v=1',
          })
          .mockRejectedValueOnce(new Error('No match found'));

        const tracks = await provider.search('test query', 'user#1234', 2);

        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.title).toBe('Song 1');
      });

      it('respects limit parameter up to 50', async () => {
        mockSpotifySearch.mockResolvedValue({
          tracks: { items: [] },
        });

        await provider.search('test query', 'user#1234', 100);

        expect(mockSpotifySearch).toHaveBeenCalledWith(
          'test query',
          ['track'],
          undefined,
          50,
        );
      });
    });

    describe('fetchPlaylist', () => {
      it('fetches Spotify playlist and resolves tracks to YouTube', async () => {
        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/playlist/abc123',
          'user#1234',
          10,
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
          title: 'Playlist Track',
          provider: ProviderType.Spotify,
          artist: 'Playlist Artist',
        });
      });

      it('fetches Spotify album and resolves tracks to YouTube', async () => {
        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/album/abc123',
          'user#1234',
          10,
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
          title: 'Album Track',
          provider: ProviderType.Spotify,
        });
      });

      it('throws error for track URL in fetchPlaylist', async () => {
        await expect(
          provider.fetchPlaylist(
            'https://open.spotify.com/track/abc123',
            'user#1234',
          ),
        ).rejects.toThrow('Not a Spotify playlist or album URL');
      });

      it('skips non-track items in playlist', async () => {
        mockSpotifyPlaylistsGetItems.mockResolvedValue({
          items: [
            {
              track: {
                type: 'episode',
                name: 'Podcast Episode',
              },
            },
            {
              track: {
                type: 'track',
                name: 'Real Track',
                duration_ms: 180000,
                artists: [{ name: 'Real Artist' }],
                album: { images: [{ url: 'real-art.jpg' }] },
              },
            },
          ],
        });

        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/playlist/abc123',
          'user#1234',
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.title).toBe('Real Track');
      });

      it('skips tracks when YouTube match fails in playlist', async () => {
        mockSpotifyPlaylistsGetItems.mockResolvedValue({
          items: [
            {
              track: {
                type: 'track',
                name: 'Track 1',
                duration_ms: 180000,
                artists: [{ name: 'Artist 1' }],
                album: { images: [{ url: 'art1.jpg' }] },
              },
            },
            {
              track: {
                type: 'track',
                name: 'Track 2',
                duration_ms: 200000,
                artists: [{ name: 'Artist 2' }],
                album: { images: [{ url: 'art2.jpg' }] },
              },
            },
          ],
        });

        vi.mocked(mockYtDlpService.search)
          .mockRejectedValueOnce(new Error('No match'))
          .mockResolvedValueOnce({
            title: 'Artist 2 - Track 2',
            duration: 200,
            thumbnail: 'thumb2.jpg',
            url: 'https://youtube.com/watch?v=2',
          });

        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/playlist/abc123',
          'user#1234',
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.title).toBe('Track 2');
      });

      it('skips tracks when YouTube match fails in album', async () => {
        mockSpotifyAlbumsGet.mockResolvedValue({
          images: [{ url: 'album-art.jpg' }],
          tracks: {
            items: [
              {
                name: 'Album Track 1',
                duration_ms: 180000,
                artists: [{ name: 'Album Artist' }],
              },
              {
                name: 'Album Track 2',
                duration_ms: 200000,
                artists: [{ name: 'Album Artist' }],
              },
            ],
          },
        });

        vi.mocked(mockYtDlpService.search)
          .mockResolvedValueOnce({
            title: 'Album Artist - Album Track 1',
            duration: 180,
            thumbnail: 'thumb1.jpg',
            url: 'https://youtube.com/watch?v=1',
          })
          .mockRejectedValueOnce(new Error('No match'));

        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/album/abc123',
          'user#1234',
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.title).toBe('Album Track 1');
      });

      it('respects maxTracks parameter for playlist', async () => {
        mockSpotifyPlaylistsGetItems.mockResolvedValue({
          items: [
            {
              track: {
                type: 'track',
                name: 'Track 1',
                duration_ms: 180000,
                artists: [{ name: 'Artist' }],
                album: { images: [] },
              },
            },
            {
              track: {
                type: 'track',
                name: 'Track 2',
                duration_ms: 180000,
                artists: [{ name: 'Artist' }],
                album: { images: [] },
              },
            },
            {
              track: {
                type: 'track',
                name: 'Track 3',
                duration_ms: 180000,
                artists: [{ name: 'Artist' }],
                album: { images: [] },
              },
            },
          ],
        });

        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/playlist/abc123',
          'user#1234',
          2,
        );

        expect(tracks.length).toBeLessThanOrEqual(2);
      });

      it('respects maxTracks parameter for album', async () => {
        mockSpotifyAlbumsGet.mockResolvedValue({
          images: [],
          tracks: {
            items: [
              {
                name: 'Track 1',
                duration_ms: 180000,
                artists: [{ name: 'A' }],
              },
              {
                name: 'Track 2',
                duration_ms: 180000,
                artists: [{ name: 'A' }],
              },
              {
                name: 'Track 3',
                duration_ms: 180000,
                artists: [{ name: 'A' }],
              },
            ],
          },
        });

        const tracks = await provider.fetchPlaylist(
          'https://open.spotify.com/album/abc123',
          'user#1234',
          2,
        );

        expect(tracks.length).toBeLessThanOrEqual(2);
      });
    });

    describe('name', () => {
      it('returns Spotify as provider name', () => {
        expect(provider.name).toBe('Spotify');
      });
    });

    describe('type', () => {
      it('returns correct provider type', () => {
        expect(provider.type).toBe(ProviderType.Spotify);
      });
    });

    describe('priority', () => {
      it('has priority of 15', () => {
        expect(provider.priority).toBe(15);
      });
    });
  });

  describe('without Spotify credentials configured', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockYtDlpService = createMockYtDlpService();
      mockConfigService = createMockConfigService(null);
      provider = new SpotifyProvider(mockYtDlpService, mockConfigService);
      provider.onModuleInit();
    });

    describe('canHandle', () => {
      it('returns false for Spotify URLs when not configured', () => {
        expect(
          provider.canHandle('https://open.spotify.com/track/abc123xyz'),
        ).toBe(false);
      });
    });

    describe('search', () => {
      it('falls back to YouTube search when Spotify not configured', async () => {
        const tracks = await provider.search('test query', 'user#1234');

        expect(tracks).toHaveLength(1);
        expect(mockYtDlpService.search).toHaveBeenCalledWith(
          'ytsearch1:test query',
        );
      });
    });

    describe('fetchTrackInfo', () => {
      it('throws error when Spotify not initialized', async () => {
        await expect(
          provider.fetchTrackInfo(
            'https://open.spotify.com/track/abc123',
            'user#1234',
          ),
        ).rejects.toThrow('Spotify provider not initialized');
      });
    });

    describe('getAudioInfo', () => {
      it('throws error when Spotify not initialized', async () => {
        await expect(
          provider.getAudioInfo('https://open.spotify.com/track/abc123'),
        ).rejects.toThrow('Spotify provider not initialized');
      });
    });

    describe('fetchPlaylist', () => {
      it('throws error when Spotify not initialized', async () => {
        await expect(
          provider.fetchPlaylist(
            'https://open.spotify.com/playlist/abc123',
            'user#1234',
          ),
        ).rejects.toThrow('Spotify provider not initialized');
      });
    });
  });

  describe('with partial Spotify credentials', () => {
    it('does not initialize when only clientId is provided', () => {
      mockConfigService = createMockConfigService({
        clientId: 'test-client-id',
        clientSecret: '',
      });
      provider = new SpotifyProvider(mockYtDlpService, mockConfigService);
      provider.onModuleInit();

      expect(provider.canHandle('https://open.spotify.com/track/abc123')).toBe(
        false,
      );
    });
  });

  describe('onModuleInit error handling', () => {
    it('handles SpotifyApi initialization failure gracefully', () => {
      mockWithClientCredentials.mockImplementationOnce(() => {
        throw new Error('Init failed');
      });

      mockConfigService = createMockConfigService({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
      const newProvider = new SpotifyProvider(
        mockYtDlpService,
        mockConfigService,
      );

      expect(() => {
        newProvider.onModuleInit();
      }).not.toThrow();
      expect(
        newProvider.canHandle('https://open.spotify.com/track/abc123'),
      ).toBe(false);
    });
  });
});
