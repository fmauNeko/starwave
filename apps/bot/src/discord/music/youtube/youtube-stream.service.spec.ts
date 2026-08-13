import { Logger } from '@nestjs/common';
import { StreamType } from '@discordjs/voice';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InnertubeSessionService } from './innertube-session.service';

interface MockVideoInfo {
  basic_info?: {
    title?: string;
    duration?: number;
    thumbnail?: { url?: string }[];
    is_live?: boolean;
  };
  videoDetails?: {
    title?: string;
    lengthSeconds?: string;
    thumbnail?: {
      thumbnails?: { url?: string }[];
    };
    isLive?: boolean;
  };
  streaming_data?: {
    adaptive_formats?: { itag: number; bitrate: number }[];
    server_abr_streaming_url?: string;
  };
  player_config?: {
    media_common_config?: {
      media_ustreamer_request_config?: {
        video_playback_ustreamer_config?: string;
      };
    };
  };
}

interface MockSearchVideo {
  video_id?: string;
  id?: string;
  title?: string | { toString: () => string };
  duration?: {
    seconds?: number;
  };
  thumbnails?: { url?: string }[];
}

interface MockSearchResults {
  videos?: MockSearchVideo[];
}

interface MockInnertubeClient {
  actions: Record<string, never>;
  getInfo: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  session: {
    context: {
      client: {
        clientName: string;
        clientVersion: string;
      };
    };
    player: {
      decipher: ReturnType<typeof vi.fn>;
      signature_timestamp: number;
    };
  };
}

interface MockSabrStreamInstance {
  on: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  setPoToken: ReturnType<typeof vi.fn>;
  setStreamingURL: ReturnType<typeof vi.fn>;
  setUstreamerConfig: ReturnType<typeof vi.fn>;
  handlers: Map<string, (reloadPlaybackContext: unknown) => void>;
}

interface CapturedSabrConfig {
  fetch?: typeof fetch;
  poToken?: string;
  serverAbrStreamingUrl?: string;
  videoPlaybackUstreamerConfig?: string;
}

const {
  MockSabrStream,
  MockNavigationEndpoint,
  mockBuildSabrFormat,
  mockSabrStart,
  mockSabrConfigs,
  mockSabrInstances,
  mockWatchEndpointCall,
} = vi.hoisted(() => {
  const mockSabrConfigs: unknown[] = [];
  const mockSabrInstances: MockSabrStreamInstance[] = [];
  const mockSabrStart = vi.fn();
  const mockWatchEndpointCall = vi.fn();

  return {
    mockBuildSabrFormat: vi.fn((format: unknown) => ({ format })),
    mockSabrStart,
    mockSabrConfigs,
    mockSabrInstances,
    mockWatchEndpointCall,
    MockNavigationEndpoint: vi.fn(function MockNavigationEndpoint(this: {
      call: typeof mockWatchEndpointCall;
    }) {
      this.call = mockWatchEndpointCall;
    }),
    MockSabrStream: vi.fn(function MockSabrStream(
      this: MockSabrStreamInstance,
      config: unknown,
    ) {
      mockSabrConfigs.push(config);
      this.handlers = new Map<
        string,
        (reloadPlaybackContext: unknown) => void
      >();
      this.on = vi.fn(
        (event: string, handler: (reloadPlaybackContext: unknown) => void) => {
          this.handlers.set(event, handler);
        },
      );
      this.start = mockSabrStart;
      this.setPoToken = vi.fn();
      this.setStreamingURL = vi.fn();
      this.setUstreamerConfig = vi.fn();
      mockSabrInstances.push(this);
    }),
  };
});

vi.mock('youtubei.js', () => ({
  Constants: {
    CLIENT_NAME_IDS: {
      WEB: '1',
    },
  },
  Platform: {
    shim: {},
  },
  YTNodes: {
    NavigationEndpoint: MockNavigationEndpoint,
  },
}));

vi.mock('googlevideo/sabr-stream', () => ({
  SabrStream: MockSabrStream,
}));

vi.mock('googlevideo/utils', () => ({
  EnabledTrackTypes: {
    AUDIO_ONLY: 1,
  },
  buildSabrFormat: mockBuildSabrFormat,
}));

import { YouTubeStreamService } from './youtube-stream.service';

const originalGlobalFetch = global.fetch;

function createInfo(overrides: Partial<MockVideoInfo> = {}): MockVideoInfo {
  return {
    basic_info: {
      title: 'Test Video',
      duration: 213,
      thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
      is_live: false,
    },
    streaming_data: {
      adaptive_formats: [
        {
          itag: 251,
          bitrate: 128_000,
        },
      ],
      server_abr_streaming_url: 'https://rr.googlevideo.com/videoplayback/sabr',
    },
    player_config: {
      media_common_config: {
        media_ustreamer_request_config: {
          video_playback_ustreamer_config: 'ustreamer-config',
        },
      },
    },
    ...overrides,
  };
}

function createAudioStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
}

function createClient(): MockInnertubeClient {
  return {
    actions: {},
    getInfo: vi.fn().mockResolvedValue(createInfo()),
    search: vi.fn().mockResolvedValue({
      videos: [
        {
          video_id: 'search12345',
          title: { toString: () => 'Search Result' },
          duration: { seconds: 240 },
          thumbnails: [{ url: 'https://example.com/search.jpg' }],
        },
      ],
    } satisfies MockSearchResults),
    session: {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '1.20240530.00.00',
        },
      },
      player: {
        decipher: vi.fn((url: string) => `${url}&deciphered=1`),
        signature_timestamp: 12345,
      },
    },
  };
}

function createSession(client: MockInnertubeClient | undefined) {
  return {
    getClient: vi.fn().mockReturnValue(client),
    getSessionPoToken: vi.fn().mockReturnValue('session-po-token'),
    generateContentPoToken: vi.fn().mockResolvedValue('content-po-token'),
    refresh: vi.fn().mockResolvedValue(undefined),
  } as unknown as InnertubeSessionService;
}

describe('YouTubeStreamService', () => {
  let service: YouTubeStreamService;
  let client: MockInnertubeClient;
  let session: InnertubeSessionService;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let mockGlobalFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSabrConfigs.length = 0;
    mockSabrInstances.length = 0;
    mockWatchEndpointCall.mockResolvedValue(createInfo());
    mockGlobalFetch = vi.fn().mockResolvedValue(new Response('segment'));
    global.fetch = mockGlobalFetch as unknown as typeof fetch;
    client = createClient();
    session = createSession(client);
    service = new YouTubeStreamService(session);

    debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalGlobalFetch;
    vi.restoreAllMocks();
  });

  describe('getMetadata', () => {
    it('returns metadata from innertube.getInfo()', async () => {
      const metadata = await service.getMetadata(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(metadata).toEqual({
        title: 'Test Video',
        duration: 213,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      expect(client.getInfo).toHaveBeenCalledWith('dQw4w9WgXcQ', {
        po_token: 'content-po-token',
      });
      expect(debugSpy).toHaveBeenCalledWith(
        'youtube.metadata.fetch: dQw4w9WgXcQ',
      );
    });

    it('rejects live streams when videoDetails marks the video as live', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          basic_info: undefined,
          videoDetails: {
            title: 'Live Video',
            lengthSeconds: '0',
            isLive: true,
          },
        }),
      );

      await expect(service.getMetadata('dQw4w9WgXcQ')).rejects.toThrow(
        /live streams/i,
      );
    });

    it('throws when no videoDetails or basic info is returned', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({ basic_info: undefined }),
      );

      await expect(service.getMetadata('dQw4w9WgXcQ')).rejects.toThrow(
        'No video metadata found',
      );
    });

    it('returns metadata from legacy videoDetails fallback fields', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          basic_info: undefined,
          videoDetails: {
            title: 'Legacy Video',
            lengthSeconds: '321',
            thumbnail: {
              thumbnails: [{ url: 'https://example.com/legacy.jpg' }],
            },
            isLive: false,
          },
        }),
      );

      await expect(service.getMetadata('dQw4w9WgXcQ')).resolves.toEqual({
        title: 'Legacy Video',
        duration: 321,
        thumbnail: 'https://example.com/legacy.jpg',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
    });

    it('uses safe metadata defaults when fields are missing', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          basic_info: {
            is_live: false,
          },
        }),
      );

      await expect(service.getMetadata('dQw4w9WgXcQ')).resolves.toEqual({
        title: 'Unknown Title',
        duration: 0,
        thumbnail: '',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
    });

    it('normalizes invalid legacy duration values to zero', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          basic_info: undefined,
          videoDetails: {
            title: 'Bad Duration',
            lengthSeconds: 'not-a-number',
            isLive: false,
          },
        }),
      );

      const metadata = await service.getMetadata('dQw4w9WgXcQ');

      expect(metadata.duration).toBe(0);
    });

    it('throws for invalid YouTube identifiers', async () => {
      await expect(service.getMetadata('not-a-youtube-video')).rejects.toThrow(
        'Invalid YouTube URL',
      );
    });

    it('throws when the Innertube session is not ready', async () => {
      service = new YouTubeStreamService(createSession(undefined));

      await expect(service.getMetadata('dQw4w9WgXcQ')).rejects.toThrow(
        'Innertube session not ready',
      );
    });
  });

  describe('search', () => {
    it('returns the first search result metadata with a canonical URL', async () => {
      const metadata = await service.search('never gonna give you up');

      expect(metadata).toEqual({
        title: 'Search Result',
        duration: 240,
        thumbnail: 'https://example.com/search.jpg',
        url: 'https://www.youtube.com/watch?v=search12345',
      });
      expect(client.search).toHaveBeenCalledWith('never gonna give you up');
      expect(debugSpy).toHaveBeenCalledWith(
        'youtube.search: never gonna give you up',
      );
    });

    it('throws when search returns no results', async () => {
      client.search.mockResolvedValueOnce({
        videos: [],
      } satisfies MockSearchResults);

      await expect(service.search('missing')).rejects.toThrow(
        'No search results found',
      );
    });

    it('uses id, string title, default duration, and best thumbnail fallbacks', async () => {
      client.search.mockResolvedValueOnce({
        videos: [
          {
            id: 'fallback123',
            title: 'Plain Title',
            thumbnails: [],
            best_thumbnail: { url: 'https://example.com/best.jpg' },
          },
        ],
      });

      await expect(service.search('plain title')).resolves.toEqual({
        title: 'Plain Title',
        duration: 0,
        thumbnail: 'https://example.com/best.jpg',
        url: 'https://www.youtube.com/watch?v=fallback123',
      });
    });

    it('uses results fallback and nested thumbnail fallback', async () => {
      client.search.mockResolvedValueOnce({
        results: [
          {
            video_id: 'results1234',
            title: { toString: () => '[object Object]' },
            duration: {},
            thumbnail: {
              thumbnails: [{ url: 'https://example.com/nested.jpg' }],
            },
          },
        ],
      });

      await expect(service.search('nested thumbnail')).resolves.toEqual({
        title: 'Unknown Title',
        duration: 0,
        thumbnail: 'https://example.com/nested.jpg',
        url: 'https://www.youtube.com/watch?v=results1234',
      });
    });

    it('uses an empty thumbnail when a result has no thumbnail data', async () => {
      client.search.mockResolvedValueOnce({
        videos: [
          {
            video_id: 'notthumb123',
            title: 'No Thumbnail',
            duration: { seconds: 10 },
          },
        ],
      });

      const metadata = await service.search('no thumbnail');

      expect(metadata.thumbnail).toBe('');
    });

    it('throws when the first search result has no video id', async () => {
      client.search.mockResolvedValueOnce({
        videos: [
          {
            title: 'Missing Id',
          },
        ],
      });

      await expect(service.search('missing id')).rejects.toThrow(
        'No search results found',
      );
    });
  });

  describe('getAudioStream', () => {
    it('returns a Node Readable stream with StreamType.WebmOpus when SABR succeeds', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      expect(audioInfo.streamType).toBe(StreamType.WebmOpus);
      expect(audioInfo.source).toBeInstanceOf(Readable);
      expect(MockSabrStream).toHaveBeenCalledTimes(1);
      expect(mockSabrStart).toHaveBeenCalledWith({
        enabledTrackTypes: 1,
        preferOpus: true,
        maxRetries: 3,
      });
      expect(mockBuildSabrFormat).toHaveBeenCalledWith({
        itag: 251,
        bitrate: 128_000,
      });
      expect(mockSabrConfigs[0]).toMatchObject({
        serverAbrStreamingUrl:
          'https://rr.googlevideo.com/videoplayback/sabr&deciphered=1',
        videoPlaybackUstreamerConfig: 'ustreamer-config',
        poToken: 'content-po-token',
        clientInfo: {
          clientName: 1,
          clientVersion: '1.20240530.00.00',
        },
      });
      expect(client.session.player.decipher).toHaveBeenCalledWith(
        'https://rr.googlevideo.com/videoplayback/sabr',
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^youtube\.stream\.acquired: dQw4w9WgXcQ \[\d+ms\]$/,
        ),
      );
      audioInfo.source.destroy();
    });

    it('registers a reloadPlayerResponse handler before starting SABR', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      expect(mockSabrInstances[0]?.on).toHaveBeenCalledWith(
        'reloadPlayerResponse',
        expect.any(Function),
      );
      expect(mockSabrInstances[0]?.on.mock.invocationCallOrder[0]).toBeLessThan(
        mockSabrStart.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      );
      audioInfo.source.destroy();
    });

    it('registers a streamProtectionStatusUpdate handler before starting SABR', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      expect(mockSabrInstances[0]?.on).toHaveBeenCalledWith(
        'streamProtectionStatusUpdate',
        expect.any(Function),
      );
      expect(mockSabrInstances[0]?.on.mock.invocationCallOrder[0]).toBeLessThan(
        mockSabrStart.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      );
      audioInfo.source.destroy();
    });

    it('re-mints a fresh PoToken without rebuilding the session on the first recovery attempt', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      vi.mocked(session.generateContentPoToken).mockResolvedValueOnce(
        'fresh-po-token',
      );

      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 2,
      });

      await vi.waitFor(() => {
        expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalledWith(
          'fresh-po-token',
        );
      });
      expect(session.refresh).not.toHaveBeenCalled();
      expect(session.generateContentPoToken).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        'youtube.stream.recover: dQw4w9WgXcQ (stream protection status 2, attempt 1/3)',
      );
      expect(logSpy).toHaveBeenCalledWith(
        'youtube.stream.recovered: dQw4w9WgXcQ',
      );
      audioInfo.source.destroy();
    });

    it('rebuilds the session only on the third recovery attempt', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      const protectionHandler = mockSabrInstances[0]?.handlers.get(
        'streamProtectionStatusUpdate',
      );

      for (let attempt = 1; attempt <= 3; attempt++) {
        protectionHandler?.({ status: 2 });
        await vi.waitFor(() => {
          expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalledTimes(
            attempt,
          );
        });
      }

      expect(session.refresh).toHaveBeenCalledExactlyOnceWith(
        'stream protection status 2',
      );
      expect(warnSpy).toHaveBeenNthCalledWith(
        3,
        'youtube.stream.recover: dQw4w9WgXcQ (stream protection status 2, attempt 3/3, rebuilding session)',
      );
      audioInfo.source.destroy();
    });

    it('caps recovery attempts and logs when the video cannot be streamed', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      const protectionHandler = mockSabrInstances[0]?.handlers.get(
        'streamProtectionStatusUpdate',
      );

      for (let attempt = 1; attempt <= 3; attempt++) {
        protectionHandler?.({ status: 2 });
        await vi.waitFor(() => {
          expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalledTimes(
            attempt,
          );
        });
      }
      protectionHandler?.({ status: 2 });

      expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(
        'youtube.stream.protected: dQw4w9WgXcQ',
        expect.stringContaining('cannot be streamed'),
      );
      audioInfo.source.destroy();
    });

    it('logs the exhausted recovery message only once', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      const protectionHandler = mockSabrInstances[0]?.handlers.get(
        'streamProtectionStatusUpdate',
      );

      for (let attempt = 1; attempt <= 3; attempt++) {
        protectionHandler?.({ status: 2 });
        await vi.waitFor(() => {
          expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalledTimes(
            attempt,
          );
        });
      }
      protectionHandler?.({ status: 2 });
      protectionHandler?.({ status: 2 });
      protectionHandler?.({ status: 2 });

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        'youtube.stream.protected: dQw4w9WgXcQ',
        expect.stringContaining('cannot be streamed'),
      );
      audioInfo.source.destroy();
    });

    it.each(['finish', 'abort'])(
      'does not recover SABR after the stream emits %s',
      async (closeEvent) => {
        mockSabrStart.mockResolvedValueOnce({
          audioStream: createAudioStream(),
        });
        const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

        mockSabrInstances[0]?.handlers.get(closeEvent)?.({});
        mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
          status: 2,
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(session.generateContentPoToken).toHaveBeenCalledTimes(1);
        expect(mockSabrInstances[0]?.setPoToken).not.toHaveBeenCalled();
        audioInfo.source.destroy();
      },
    );

    it('does not recover SABR for below-threshold or missing stream protection status', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 1,
      });
      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({});
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));

      expect(session.refresh).not.toHaveBeenCalled();
      expect(mockSabrInstances[0]?.setPoToken).not.toHaveBeenCalled();
      audioInfo.source.destroy();
    });

    it('deduplicates concurrent SABR recovery attempts', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      let resolveToken!: (token: string) => void;
      vi.mocked(session.generateContentPoToken).mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
      );

      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 2,
      });
      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 2,
      });
      resolveToken('fresh-po-token');

      await vi.waitFor(() => {
        expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalled();
      });
      expect(session.refresh).not.toHaveBeenCalled();
      expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalledTimes(1);
      expect(session.generateContentPoToken).toHaveBeenCalledTimes(2);
      audioInfo.source.destroy();
    });

    it('defers segment requests while SABR recovery is in flight', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      let resolveToken!: (token: string) => void;
      vi.mocked(session.generateContentPoToken).mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
      );

      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 2,
      });
      const gated = (mockSabrConfigs[0] as CapturedSabrConfig).fetch;
      const pending = gated?.('https://seg.example/1', { method: 'POST' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockGlobalFetch).not.toHaveBeenCalled();

      resolveToken('fresh-po-token');
      await pending;
      expect(mockGlobalFetch).toHaveBeenCalledWith('https://seg.example/1', {
        method: 'POST',
      });
      audioInfo.source.destroy();
    });

    it('passes segment requests through when no SABR recovery is in flight', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      const gated = (mockSabrConfigs[0] as CapturedSabrConfig).fetch;

      const response = await gated?.('https://seg.example/2', undefined);

      expect(mockGlobalFetch).toHaveBeenCalledExactlyOnceWith(
        'https://seg.example/2',
        undefined,
      );
      expect(response).toBe(await mockGlobalFetch.mock.results[0]?.value);
      audioInfo.source.destroy();
    });

    it('clears failed Error recovery so segment requests continue', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      vi.mocked(session.generateContentPoToken).mockRejectedValueOnce(
        new Error('boom'),
      );

      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 2,
      });

      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'youtube.stream.recover.failed: dQw4w9WgXcQ',
          'boom',
        );
      });
      expect(mockSabrInstances[0]?.setPoToken).not.toHaveBeenCalled();

      const gated = (mockSabrConfigs[0] as CapturedSabrConfig).fetch;
      await gated?.('https://seg.example/error', undefined);
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'https://seg.example/error',
        undefined,
      );
      audioInfo.source.destroy();
    });

    it('logs non-Error SABR recovery failures', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      vi.mocked(session.generateContentPoToken).mockRejectedValueOnce(
        'string-fail',
      );

      mockSabrInstances[0]?.handlers.get('streamProtectionStatusUpdate')?.({
        status: 2,
      });

      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'youtube.stream.recover.failed: dQw4w9WgXcQ',
          'string-fail',
        );
      });
      expect(mockSabrInstances[0]?.setPoToken).not.toHaveBeenCalled();

      const gated = (mockSabrConfigs[0] as CapturedSabrConfig).fetch;
      await gated?.('https://seg.example/non-error', undefined);
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'https://seg.example/non-error',
        undefined,
      );
      audioInfo.source.destroy();
    });

    it('recovers SABR in addition to refreshing config after a player reload', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      mockWatchEndpointCall.mockResolvedValueOnce(
        createInfo({
          streaming_data: {
            adaptive_formats: [{ itag: 251, bitrate: 128_000 }],
            server_abr_streaming_url:
              'https://rr.googlevideo.com/videoplayback/fresh-sabr',
          },
          player_config: {
            media_common_config: {
              media_ustreamer_request_config: {
                video_playback_ustreamer_config: 'fresh-ustreamer-config',
              },
            },
          },
        }),
      );
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      mockSabrInstances[0]?.handlers.get('reloadPlayerResponse')?.({
        reload: true,
      });

      await vi.waitFor(() => {
        expect(mockSabrInstances[0]?.setStreamingURL).toHaveBeenCalledWith(
          'https://rr.googlevideo.com/videoplayback/fresh-sabr&deciphered=1',
        );
      });
      expect(session.refresh).not.toHaveBeenCalled();
      expect(mockSabrInstances[0]?.setPoToken).toHaveBeenCalled();
      audioInfo.source.destroy();
    });

    it('defers segment requests while a player reload is in flight', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      let resolveReload!: (info: MockVideoInfo) => void;
      mockWatchEndpointCall.mockReturnValueOnce(
        new Promise<MockVideoInfo>((resolve) => {
          resolveReload = resolve;
        }),
      );

      mockSabrInstances[0]?.handlers.get('reloadPlayerResponse')?.({
        reload: true,
      });
      const gated = (mockSabrConfigs[0] as CapturedSabrConfig).fetch;
      const pending = gated?.('https://seg.example/reload', undefined);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockGlobalFetch).not.toHaveBeenCalled();

      resolveReload(
        createInfo({
          streaming_data: {
            adaptive_formats: [{ itag: 251, bitrate: 128_000 }],
            server_abr_streaming_url:
              'https://rr.googlevideo.com/videoplayback/reloaded-sabr',
          },
          player_config: {
            media_common_config: {
              media_ustreamer_request_config: {
                video_playback_ustreamer_config: 'reloaded-ustreamer-config',
              },
            },
          },
        }),
      );
      await pending;
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        'https://seg.example/reload',
        undefined,
      );
      audioInfo.source.destroy();
    });

    it('updates SABR streaming URL and ustreamer config after a successful player reload', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      mockWatchEndpointCall.mockResolvedValueOnce(
        createInfo({
          streaming_data: {
            adaptive_formats: [{ itag: 251, bitrate: 128_000 }],
            server_abr_streaming_url:
              'https://rr.googlevideo.com/videoplayback/fresh-sabr',
          },
          player_config: {
            media_common_config: {
              media_ustreamer_request_config: {
                video_playback_ustreamer_config: 'fresh-ustreamer-config',
              },
            },
          },
        }),
      );
      const reloadPlaybackContext = { reload: true };

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      mockSabrInstances[0]?.handlers.get('reloadPlayerResponse')?.(
        reloadPlaybackContext,
      );

      await vi.waitFor(() => {
        expect(mockSabrInstances[0]?.setStreamingURL).toHaveBeenCalledWith(
          'https://rr.googlevideo.com/videoplayback/fresh-sabr&deciphered=1',
        );
      });
      expect(mockSabrInstances[0]?.setUstreamerConfig).toHaveBeenCalledWith(
        'fresh-ustreamer-config',
      );
      expect(MockNavigationEndpoint).toHaveBeenCalledWith({
        watchEndpoint: { videoId: 'dQw4w9WgXcQ' },
      });
      expect(mockWatchEndpointCall).toHaveBeenCalledWith(client.actions, {
        playbackContext: {
          adPlaybackContext: { pyv: true },
          contentPlaybackContext: {
            vis: 0,
            splay: false,
            lactMilliseconds: '-1',
            signatureTimestamp: 12345,
          },
          reloadPlaybackContext,
        },
        contentCheckOk: true,
        racyCheckOk: true,
        parse: true,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        'youtube.stream.reload: dQw4w9WgXcQ',
      );
      expect(logSpy).toHaveBeenCalledWith(
        'youtube.stream.reloaded: dQw4w9WgXcQ',
      );
      audioInfo.source.destroy();
    });

    it('logs and keeps the process alive when a player reload has no deciphered URL', async () => {
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });
      client.session.player.decipher
        .mockReturnValueOnce(
          'https://rr.googlevideo.com/videoplayback/sabr&deciphered=1',
        )
        .mockReturnValueOnce(undefined);

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');
      expect(() => {
        mockSabrInstances[0]?.handlers.get('reloadPlayerResponse')?.({});
      }).not.toThrow();

      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'youtube.stream.reload.failed: dQw4w9WgXcQ',
          'missing url or config',
        );
      });
      expect(mockSabrInstances[0]?.setStreamingURL).not.toHaveBeenCalled();
      expect(mockSabrInstances[0]?.setUstreamerConfig).not.toHaveBeenCalled();
      audioInfo.source.destroy();
    });

    it('rejects live streams before creating a SABR stream', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({ basic_info: { is_live: true } }),
      );

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        /live/i,
      );
      expect(MockSabrStream).not.toHaveBeenCalled();
    });

    it('refreshes the session and retries once after a token failure', async () => {
      mockSabrStart
        .mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))
        .mockResolvedValueOnce({ audioStream: createAudioStream() });

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      expect(audioInfo.streamType).toBe(StreamType.WebmOpus);
      expect(session.refresh).toHaveBeenCalledTimes(1);
      expect(session.refresh).toHaveBeenCalledWith(
        'token failure on stream acquisition',
      );
      expect(MockSabrStream).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        'youtube.stream.error: token failure, refreshing session for dQw4w9WgXcQ',
      );
      audioInfo.source.destroy();
    });

    it('propagates the retry error when token refresh does not recover SABR', async () => {
      mockSabrStart
        .mockRejectedValueOnce(new Error('login_required'))
        .mockRejectedValueOnce(new Error('HTTP 403 Forbidden after refresh'));

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        'HTTP 403 Forbidden after refresh',
      );
      expect(session.refresh).toHaveBeenCalledTimes(1);
      expect(MockSabrStream).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        'youtube.stream.error: dQw4w9WgXcQ',
        'HTTP 403 Forbidden after refresh',
      );
    });

    it('propagates age-restricted or region-locked SABR failures with a clear message', async () => {
      mockSabrStart.mockRejectedValueOnce(
        new Error('Video is age restricted or region locked'),
      );

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        /age restricted|region locked/i,
      );
      expect(session.refresh).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'youtube.stream.error: dQw4w9WgXcQ',
        'Video is age restricted or region locked',
      );
    });

    it('propagates non-Error SABR failures without refreshing the session', async () => {
      mockSabrStart.mockRejectedValueOnce('network failed');

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toBe(
        'network failed',
      );
      expect(session.refresh).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'youtube.stream.error: dQw4w9WgXcQ',
        'network failed',
      );
    });

    it('throws when no SABR streaming URL is available', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          streaming_data: {
            adaptive_formats: [{ itag: 251, bitrate: 128_000 }],
          },
        }),
      );

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        'No SABR streaming URL available',
      );
    });

    it('throws when the SABR streaming URL cannot be deciphered', async () => {
      client.session.player.decipher.mockReturnValueOnce(undefined);

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        'Could not decipher SABR streaming URL',
      );
      expect(client.session.player.decipher).toHaveBeenCalledWith(
        'https://rr.googlevideo.com/videoplayback/sabr',
      );
      expect(MockSabrStream).not.toHaveBeenCalled();
    });

    it('throws when no SABR ustreamer config is available', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          player_config: {
            media_common_config: {},
          },
        }),
      );

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        'No SABR ustreamer config available',
      );
    });

    it('allows SABR to choose from an empty format list when adaptive formats are absent', async () => {
      client.getInfo.mockResolvedValueOnce(
        createInfo({
          streaming_data: {
            server_abr_streaming_url:
              'https://rr.googlevideo.com/videoplayback/sabr',
          },
        }),
      );
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      expect(mockBuildSabrFormat).not.toHaveBeenCalled();
      expect(mockSabrConfigs[0]).toMatchObject({ formats: [] });
      audioInfo.source.destroy();
    });

    it('uses numeric Innertube client names directly when no constant mapping exists', async () => {
      client.session.context.client.clientName = '1';
      mockSabrStart.mockResolvedValueOnce({ audioStream: createAudioStream() });

      const audioInfo = await service.getAudioStream('dQw4w9WgXcQ');

      expect(mockSabrConfigs[0]).toMatchObject({
        clientInfo: {
          clientName: 1,
        },
      });
      audioInfo.source.destroy();
    });

    it('throws when the Innertube client name cannot be converted for SABR', async () => {
      client.session.context.client.clientName = 'UNKNOWN_CLIENT';

      await expect(service.getAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        'Unsupported Innertube client: UNKNOWN_CLIENT',
      );
    });
  });
});
