import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../config/config.type';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockImplementation(() => {
    throw new Error('ENOENT');
  }),
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
  }),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  chmod: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:stream', () => ({
  Readable: {
    fromWeb: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
    }),
  },
}));

const { mockExecYtDlp } = vi.hoisted(() => ({
  mockExecYtDlp: vi.fn(),
}));

vi.mock('./yt-dlp.util', () => ({
  execYtDlp: mockExecYtDlp,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { YtDlpService } from './yt-dlp.service';

function createMockConfigService(cookiesPath?: string): ConfigService<Config> {
  return {
    get: vi.fn().mockReturnValue(cookiesPath ? { cookiesPath } : undefined),
  } as unknown as ConfigService<Config>;
}

describe('YtDlpService', () => {
  let service: YtDlpService;
  let configService: ConfigService<Config>;

  beforeEach(() => {
    vi.clearAllMocks();
    configService = createMockConfigService();

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tag_name: '2024.01.01' }),
      body: {
        getReader: vi.fn().mockReturnValue({
          read: vi.fn().mockResolvedValue({ done: true }),
        }),
      },
    });
  });

  describe('constructor', () => {
    it('initializes with default paths', () => {
      service = new YtDlpService(configService);

      expect(configService.get).toHaveBeenCalledWith('youtube', {
        infer: true,
      });
    });

    it('reads cookies path from config', () => {
      const configWithCookies = createMockConfigService('/path/to/cookies.txt');
      service = new YtDlpService(configWithCookies);

      expect(configWithCookies.get).toHaveBeenCalledWith('youtube', {
        infer: true,
      });
    });
  });

  describe('onModuleInit', () => {
    it('downloads binary if not present', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      service = new YtDlpService(configService);

      await service.onModuleInit();

      expect(mkdir).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.github.com'),
        expect.any(Object),
      );
    });

    it('skips download if binary exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);

      await service.onModuleInit();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);
      await service.onModuleInit();
    });

    it('skips update if version matches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ tag_name: '2024.01.01' }),
      });

      await service.checkForUpdates();

      expect(writeFile).not.toHaveBeenCalled();
    });

    it('downloads new version if available', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.02.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      await service.checkForUpdates();

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('github.com/yt-dlp/yt-dlp/releases/download'),
      );
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.checkForUpdates()).resolves.toBeUndefined();
    });
  });

  describe('getVideoInfo', () => {
    beforeEach(async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);
      await service.onModuleInit();
    });

    it('returns parsed video info', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          title: 'Test Video',
          duration: 300,
          thumbnail: 'https://example.com/thumb.jpg',
        }),
      );

      const info = await service.getVideoInfo(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(info).toEqual({
        title: 'Test Video',
        duration: 300,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.youtube.com/watch?v=test123',
      });
    });

    it('uses default values for missing fields', async () => {
      mockExecYtDlp.mockResolvedValueOnce(JSON.stringify({}));

      const info = await service.getVideoInfo(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(info.title).toBe('Unknown Title');
      expect(info.duration).toBe(0);
      expect(info.thumbnail).toBe('');
    });

    it('uses thumbnails array fallback', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          title: 'Test',
          thumbnails: [{ url: 'https://example.com/fallback.jpg' }],
        }),
      );

      const info = await service.getVideoInfo(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(info.thumbnail).toBe('https://example.com/fallback.jpg');
    });

    it('throws if service not ready', async () => {
      const uninitializedService = new YtDlpService(configService);

      await expect(
        uninitializedService.getVideoInfo(
          'https://www.youtube.com/watch?v=test',
        ),
      ).rejects.toThrow('yt-dlp binary not ready');
    });
  });

  describe('getAudioUrl', () => {
    beforeEach(async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);
      await service.onModuleInit();
    });

    it('returns trimmed audio URL', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        'https://example.com/audio.webm?token=abc\nopus\nwebm\n',
      );

      const url = await service.getAudioUrl(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(url).toBe('https://example.com/audio.webm?token=abc');
    });

    it('throws if yt-dlp returns empty', async () => {
      mockExecYtDlp.mockResolvedValueOnce('');

      await expect(
        service.getAudioUrl('https://www.youtube.com/watch?v=test123'),
      ).rejects.toThrow('yt-dlp returned empty URL');
    });

    it('passes correct arguments to yt-dlp with Opus preference', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        'https://example.com/audio.webm\nopus\nwebm',
      );

      await service.getAudioUrl('https://www.youtube.com/watch?v=test123');

      expect(mockExecYtDlp).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp'),
        expect.arrayContaining([
          '-f',
          'bestaudio[acodec=opus]/bestaudio',
          '--print',
          '%(urls)s',
          '--print',
          '%(acodec)s',
          '--print',
          '%(ext)s',
        ]),
      );
    });

    it('includes cookies when configured', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const configWithCookies = createMockConfigService('/path/to/cookies.txt');
      const serviceWithCookies = new YtDlpService(configWithCookies);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      await serviceWithCookies.onModuleInit();

      mockExecYtDlp.mockResolvedValueOnce(
        'https://example.com/audio.webm\nopus\nwebm',
      );

      await serviceWithCookies.getAudioUrl(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(mockExecYtDlp).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--cookies', '/path/to/cookies.txt']),
      );
    });
  });

  describe('getAudioInfo', () => {
    beforeEach(async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);
      await service.onModuleInit();
    });

    it('returns url, codec, and container', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        'https://example.com/audio.webm\nopus\nwebm\n',
      );

      const info = await service.getAudioInfo(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(info).toEqual({
        url: 'https://example.com/audio.webm',
        codec: 'opus',
        container: 'webm',
      });
    });

    it('uses default values for missing codec/container', async () => {
      mockExecYtDlp.mockResolvedValueOnce('https://example.com/audio.webm\n');

      const info = await service.getAudioInfo(
        'https://www.youtube.com/watch?v=test123',
      );

      expect(info).toEqual({
        url: 'https://example.com/audio.webm',
        codec: 'unknown',
        container: 'unknown',
      });
    });

    it('throws if service not ready', async () => {
      const uninitializedService = new YtDlpService(configService);

      await expect(
        uninitializedService.getAudioInfo(
          'https://www.youtube.com/watch?v=test',
        ),
      ).rejects.toThrow('yt-dlp binary not ready');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);
      await service.onModuleInit();
    });

    it('returns video info for search query using ytsearch1 prefix', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          title: 'Test Video',
          duration: 300,
          thumbnail: 'https://example.com/thumb.jpg',
          webpage_url: 'https://www.youtube.com/watch?v=abc123',
        }),
      );

      const info = await service.search('test query');

      expect(info).toEqual({
        title: 'Test Video',
        duration: 300,
        thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.youtube.com/watch?v=abc123',
      });
    });

    it('passes ytsearch1 prefix to yt-dlp', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          title: 'Test',
          webpage_url: 'https://www.youtube.com/watch?v=abc123',
        }),
      );

      await service.search('my search query');

      expect(mockExecYtDlp).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp'),
        expect.arrayContaining(['ytsearch1:my search query']),
      );
    });

    it('uses default values for missing fields', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          webpage_url: 'https://www.youtube.com/watch?v=abc123',
        }),
      );

      const info = await service.search('test');

      expect(info.title).toBe('Unknown Title');
      expect(info.duration).toBe(0);
      expect(info.thumbnail).toBe('');
    });

    it('uses thumbnails array fallback when thumbnail is missing', async () => {
      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          title: 'Test',
          webpage_url: 'https://www.youtube.com/watch?v=abc123',
          thumbnails: [{ url: 'https://example.com/fallback.jpg' }],
        }),
      );

      const info = await service.search('test');

      expect(info.thumbnail).toBe('https://example.com/fallback.jpg');
    });

    it('throws if service not ready', async () => {
      const uninitializedService = new YtDlpService(configService);

      await expect(uninitializedService.search('test')).rejects.toThrow(
        'yt-dlp binary not ready',
      );
    });

    it('throws if no results found (empty webpage_url)', async () => {
      mockExecYtDlp.mockResolvedValueOnce(JSON.stringify({}));

      await expect(service.search('nonexistent video')).rejects.toThrow(
        'No search results found',
      );
    });

    it('includes cookies when configured', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const configWithCookies = createMockConfigService('/path/to/cookies.txt');
      const serviceWithCookies = new YtDlpService(configWithCookies);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      await serviceWithCookies.onModuleInit();

      mockExecYtDlp.mockResolvedValueOnce(
        JSON.stringify({
          title: 'Test',
          webpage_url: 'https://www.youtube.com/watch?v=abc123',
        }),
      );

      await serviceWithCookies.search('test');

      expect(mockExecYtDlp).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--cookies', '/path/to/cookies.txt']),
      );
    });
  });

  describe('forceUpdate', () => {
    beforeEach(async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('2024.01.01');
      service = new YtDlpService(configService);
      await service.onModuleInit();
    });

    it('downloads latest version regardless of current', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.01.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      await service.forceUpdate();

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('github.com/yt-dlp/yt-dlp/releases/download'),
      );
    });
  });

  describe('musl libc detection', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      vi.clearAllMocks();
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('detects musl from /proc/self/maps containing musl', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        '/lib/ld-musl-x86_64.so.1\n/app/something.so',
      );
      vi.mocked(existsSync).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.02.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      service = new YtDlpService(configService);
      await service.onModuleInit();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp_musllinux'),
      );
    });

    it('detects musl from /etc/alpine-release when /proc/self/maps fails', async () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      vi.mocked(existsSync).mockImplementation((path) => {
        if (typeof path === 'string' && path === '/etc/alpine-release')
          return true;
        return false;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.02.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      service = new YtDlpService(configService);
      await service.onModuleInit();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp_musllinux'),
      );
    });

    it('uses glibc binary when not on musl', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        '/lib/x86_64-linux-gnu/libc.so.6\n/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
      );
      vi.mocked(existsSync).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.02.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      service = new YtDlpService(configService);
      await service.onModuleInit();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/yt-dlp_linux$/),
      );
    });

    it('uses correct binary on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      vi.mocked(existsSync).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.02.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      service = new YtDlpService(configService);
      await service.onModuleInit();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp.exe'),
      );
    });

    it('uses correct binary on macOS', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      vi.mocked(existsSync).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ tag_name: '2024.02.01' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: vi.fn().mockReturnValue({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        });

      service = new YtDlpService(configService);
      await service.onModuleInit();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp_macos'),
      );
    });
  });
});
