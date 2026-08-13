import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../../config/config.type';

interface InnertubeCreateOptions {
  enable_session_cache?: boolean;
  generate_session_locally?: boolean;
  po_token?: string;
  user_agent?: string;
  visitor_data?: string;
  cookie?: string;
}

interface MockInnertubeClient {
  readonly label: string;
  readonly session: {
    readonly logged_in: boolean;
    readonly context: {
      readonly client: {
        readonly visitorData?: string;
      };
    };
  };
}

interface MockDom {
  readonly window: {
    readonly label: string;
    readonly document: {
      readonly label: string;
    };
    readonly location: {
      readonly href: string;
    };
    readonly navigator: {
      readonly userAgent: string;
    };
    readonly origin: string;
    yt?: {
      readonly config_: Record<string, unknown>;
    };
  };
}

const {
  mockBotGuardCreate,
  mockBuildURL,
  mockFetch,
  mockGetHeaders,
  mockExistsSync,
  mockInnertubeCreate,
  mockJSDOMConstructor,
  mockMintAsWebsafeString,
  mockReadFileSync,
  mockSnapshot,
  mockWebPoMinterCreate,
} = vi.hoisted(() => ({
  mockBotGuardCreate: vi.fn(),
  mockBuildURL: vi.fn(),
  mockFetch: vi.fn(),
  mockGetHeaders: vi.fn(),
  mockExistsSync: vi.fn(),
  mockInnertubeCreate: vi.fn(),
  mockJSDOMConstructor: vi.fn(),
  mockMintAsWebsafeString: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockSnapshot: vi.fn(),
  mockWebPoMinterCreate: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: mockInnertubeCreate,
  },
}));

vi.mock('bgutils-js/botguard', () => ({
  BotGuardClient: {
    create: mockBotGuardCreate,
  },
}));

vi.mock('bgutils-js/webpo', () => ({
  WebPoMinter: {
    create: mockWebPoMinterCreate,
  },
}));

vi.mock('bgutils-js/utils', () => ({
  GOOG_API_KEY: 'test-api-key',
  USER_AGENT: 'test-user-agent',
  buildURL: mockBuildURL,
  getHeaders: mockGetHeaders,
  parseLooseJSON: JSON.parse,
}));

vi.mock('jsdom', () => ({
  JSDOM: mockJSDOMConstructor,
}));

import { InnertubeSessionService } from './innertube-session.service';

const originalFetch = global.fetch;

function createClient(
  visitorData: string | undefined,
  label: string,
  loggedIn = false,
): MockInnertubeClient {
  const client = visitorData === undefined ? {} : { visitorData };

  return {
    label,
    session: {
      logged_in: loggedIn,
      context: {
        client,
      },
    },
  };
}

function createChallenge() {
  return {
    globalName: 'BG_VM',
    interpreterUrl: {
      privateDoNotAccessOrElseTrustedResourceUrlWrappedValue:
        '//example.com/interpreter.js',
    },
    program: 'program',
  };
}

function createPageHtml(
  challenge: ReturnType<typeof createChallenge> = createChallenge(),
  eventId = 'page-event-id',
): string {
  return `<script>ytcfg.set(${JSON.stringify({ EVENT_ID: eventId })});</script><script>window.ytAtN(${JSON.stringify({ R: { bgChallenge: challenge } })})</script>`;
}

function createTvConfig(
  challenge: ReturnType<typeof createChallenge> = createChallenge(),
  requestKey = 'tv-request-key',
): string {
  return `)]}'${JSON.stringify({
    challengeParams: {
      R: JSON.stringify({ bgChallenge: challenge }),
    },
    challengeRequestKey: requestKey,
  })}`;
}

function createDom(label: string): MockDom {
  return {
    window: {
      label,
      document: {
        label: `${label}-document`,
      },
      location: {
        href: 'https://www.youtube.com/',
      },
      navigator: {
        userAgent: 'test-user-agent',
      },
      origin: 'https://www.youtube.com',
    },
  };
}

function createTextResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(text),
  };
}

function createJsonResponse(json: unknown[], ok = true, status = 200) {
  return {
    json: vi.fn().mockResolvedValue(json),
    ok,
    status,
  };
}

function queueMinterBuild(sessionPoToken: string): void {
  mockFetch
    .mockResolvedValueOnce(createTextResponse(createPageHtml()))
    .mockResolvedValueOnce(
      createTextResponse('globalThis.__bg_vm_loaded = true;'),
    )
    .mockResolvedValueOnce(createJsonResponse(['integrity-token']));
  mockBotGuardCreate.mockResolvedValueOnce({ snapshot: mockSnapshot });
  mockSnapshot.mockResolvedValueOnce('botguard-response');
  mockWebPoMinterCreate.mockResolvedValueOnce({
    mintAsWebsafeString: mockMintAsWebsafeString,
  });
  mockMintAsWebsafeString.mockResolvedValueOnce(sessionPoToken);
}

function queueSessionBuild(
  visitorData: string,
  sessionPoToken: string,
  label: string,
  loggedIn = false,
): MockInnertubeClient {
  const bootstrapClient = createClient(visitorData, `${label}-bootstrap`);
  const tokenizedClient = createClient(
    visitorData,
    `${label}-tokenized`,
    loggedIn,
  );

  mockInnertubeCreate
    .mockResolvedValueOnce(bootstrapClient)
    .mockResolvedValueOnce(tokenizedClient);
  queueMinterBuild(sessionPoToken);

  return tokenizedClient;
}

describe('InnertubeSessionService', () => {
  let service: InnertubeSessionService;
  let dom: MockDom;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let mockConfigGet: ReturnType<typeof vi.fn>;
  let configService: ConfigService<Config>;

  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'location');
    Reflect.deleteProperty(globalThis, 'origin');
    Reflect.deleteProperty(globalThis, '__bg_vm_loaded');
    Reflect.deleteProperty(globalThis, 'yt');

    global.fetch = mockFetch;
    mockBuildURL.mockReturnValue('https://jnn-pa.example/GenerateIT');
    mockGetHeaders.mockReturnValue({
      'content-type': 'application/json+protobuf',
    });
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
    mockConfigGet = vi.fn().mockReturnValue({ cookiesPath: undefined });
    configService = {
      get: mockConfigGet,
    } as unknown as ConfigService<Config>;
    dom = createDom('innertube');
    mockJSDOMConstructor.mockImplementation(function MockJSDOM() {
      return dom;
    });

    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    service = new InnertubeSessionService(configService);
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'location');
    Reflect.deleteProperty(globalThis, 'origin');
    Reflect.deleteProperty(globalThis, '__bg_vm_loaded');
    Reflect.deleteProperty(globalThis, 'yt');
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('creates a jsdom window, generates WebPo minter, creates and caches the Innertube client', async () => {
      const client = queueSessionBuild(
        'visitor-data-1',
        'session-po-token-1',
        'init',
      );

      await service.onModuleInit();

      expect(mockJSDOMConstructor).toHaveBeenCalledTimes(1);
      expect(globalThis.window).toBe(dom.window);
      expect(globalThis.document).toBe(dom.window.document);
      expect(globalThis.location).toBe(dom.window.location);
      expect(globalThis.origin).toBe(dom.window.origin);
      expect(mockInnertubeCreate).toHaveBeenNthCalledWith(1, {
        enable_session_cache: false,
        generate_session_locally: true,
        user_agent: 'test-user-agent',
      } satisfies InnertubeCreateOptions);
      expect(mockInnertubeCreate.mock.calls[0]?.[0]).not.toHaveProperty(
        'cookie',
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://www.youtube.com',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({
            'user-agent': 'test-user-agent',
          }),
        }),
      );
      expect(globalThis.yt).toEqual({
        config_: { EVENT_ID: 'page-event-id' },
      });
      expect(dom.window.yt).toEqual({
        config_: { EVENT_ID: 'page-event-id' },
      });
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/interpreter.js',
        expect.anything(),
      );
      expect(mockBotGuardCreate).toHaveBeenCalledWith({
        globalName: 'BG_VM',
        globalObject: globalThis,
        program: 'program',
      });
      expect(mockSnapshot).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        webPoSignalOutput: expect.any(Array),
      });
      expect(mockBuildURL).toHaveBeenCalledWith('GenerateIT', true);
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://jnn-pa.example/GenerateIT',
        expect.objectContaining({
          body: JSON.stringify(['O43z0dpjhgX20SCx4KAo', 'botguard-response']),
          method: 'POST',
        }),
      );
      expect(mockWebPoMinterCreate).toHaveBeenCalledWith(
        {
          estimatedTtlSecs: undefined,
          integrityToken: 'integrity-token',
          mintRefreshThreshold: undefined,
          websafeFallbackToken: undefined,
        },
        expect.any(Array),
      );
      expect(mockMintAsWebsafeString).toHaveBeenCalledWith('visitor-data-1');
      expect(mockInnertubeCreate).toHaveBeenNthCalledWith(2, {
        enable_session_cache: false,
        generate_session_locally: true,
        po_token: 'session-po-token-1',
        user_agent: 'test-user-agent',
        visitor_data: 'visitor-data-1',
      } satisfies InnertubeCreateOptions);
      expect(mockInnertubeCreate.mock.calls[1]?.[0]).not.toHaveProperty(
        'cookie',
      );
      expect(service.getClient()).toBe(client);
      expect(service.getSessionPoToken()).toBe('session-po-token-1');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^innertube\.session\.init \[\d+ms, logged_in=false\]$/,
        ),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('session-po-token-1'),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('visitor-data-1'),
      );
    });

    it('passes a parsed cookies.txt header to both Innertube clients when cookiesPath is readable', async () => {
      mockConfigGet.mockReturnValue({ cookiesPath: 'D:/cookies.txt' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        [
          '# Netscape HTTP Cookie File',
          '',
          '#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\t__Secure-3PSID\tabc',
          '.google.com\tTRUE\t/\tTRUE\t0\tSAPISID\tgoogle-token',
          '.example.com\tTRUE\t/\tFALSE\t0\tIGNORED\tnope',
          '.youtube.com\tTRUE\t/\tFALSE\t0\tTOO_SHORT',
        ].join('\n'),
      );
      queueSessionBuild(
        'visitor-data-1',
        'session-po-token-1',
        'authenticated',
        true,
      );

      await service.onModuleInit();

      const expectedCookie = '__Secure-3PSID=abc; SAPISID=google-token';
      expect(mockConfigGet).toHaveBeenCalledWith('youtube', { infer: true });
      expect(mockReadFileSync).toHaveBeenCalledWith('D:/cookies.txt', 'utf8');
      expect(mockInnertubeCreate.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ cookie: expectedCookie }),
      );
      expect(mockInnertubeCreate.mock.calls[1]?.[0]).toEqual(
        expect.objectContaining({ cookie: expectedCookie }),
      );
      expect(expectedCookie).not.toContain('IGNORED=nope');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^innertube\.session\.init \[\d+ms, logged_in=true\]$/,
        ),
      );
    });

    it('falls back to anonymous when cookiesPath is set but the file is missing', async () => {
      mockConfigGet.mockReturnValue({ cookiesPath: 'D:/missing-cookies.txt' });
      mockExistsSync.mockReturnValue(false);
      queueSessionBuild('visitor-data-1', 'session-po-token-1', 'missing');

      await service.onModuleInit();

      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockInnertubeCreate.mock.calls[0]?.[0]).not.toHaveProperty(
        'cookie',
      );
      expect(mockInnertubeCreate.mock.calls[1]?.[0]).not.toHaveProperty(
        'cookie',
      );
    });

    it('falls back to anonymous when cookies.txt has no usable YouTube or Google cookies', async () => {
      mockConfigGet.mockReturnValue({ cookiesPath: 'D:/empty-cookies.txt' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        [
          '',
          '# comment',
          '.example.com\tTRUE\t/\tFALSE\t0\tSID\tuntrusted',
          '.youtube.com\tTRUE\t/\tFALSE\t0\tMALFORMED',
        ].join('\n'),
      );
      queueSessionBuild('visitor-data-1', 'session-po-token-1', 'empty');

      await service.onModuleInit();

      expect(mockInnertubeCreate.mock.calls[0]?.[0]).not.toHaveProperty(
        'cookie',
      );
      expect(mockInnertubeCreate.mock.calls[1]?.[0]).not.toHaveProperty(
        'cookie',
      );
    });

    it('warns and falls back to anonymous when cookies.txt cannot be read', async () => {
      const readFailure = new Error('permission denied');
      mockConfigGet.mockReturnValue({
        cookiesPath: 'D:/unreadable-cookies.txt',
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw readFailure;
      });
      queueSessionBuild('visitor-data-1', 'session-po-token-1', 'unreadable');

      await service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        'innertube.cookies.read_failed: permission denied',
      );
      expect(mockInnertubeCreate.mock.calls[0]?.[0]).not.toHaveProperty(
        'cookie',
      );
      expect(mockInnertubeCreate.mock.calls[1]?.[0]).not.toHaveProperty(
        'cookie',
      );
    });

    it('rejects if the bootstrap session does not expose visitor data', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient(undefined, 'missing-visitor-data'),
      );

      await expect(service.onModuleInit()).rejects.toThrow(
        'Innertube session did not provide visitor_data',
      );

      expect(mockBotGuardCreate).not.toHaveBeenCalled();
      expect(service.getClient()).toBeUndefined();
    });

    it('rejects if the attestation interpreter URL is missing', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'missing-interpreter-url'),
      );
      mockFetch.mockResolvedValueOnce(
        createTextResponse(
          createPageHtml({
            globalName: 'BG_VM',
            interpreterUrl: {},
            program: 'program',
          }),
        ),
      );

      await expect(service.onModuleInit()).rejects.toThrow(
        'Innertube attestation interpreter URL missing',
      );
    });

    it('rejects if the BotGuard interpreter fetch fails', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'bad-interpreter'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse(createPageHtml()))
        .mockResolvedValueOnce(createTextResponse('', false, 503));

      await expect(service.onModuleInit()).rejects.toThrow(
        'Failed to fetch BotGuard interpreter: 503',
      );
    });

    it('rejects if the BotGuard interpreter script is empty', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'empty-interpreter'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse(createPageHtml()))
        .mockResolvedValueOnce(createTextResponse(''));

      await expect(service.onModuleInit()).rejects.toThrow(
        'BotGuard interpreter was empty',
      );
    });

    it('rejects if the integrity token response is malformed', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'bad-integrity'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse(createPageHtml()))
        .mockResolvedValueOnce(
          createTextResponse('globalThis.__bg_vm_loaded = true;'),
        )
        .mockResolvedValueOnce(createJsonResponse([]));
      mockBotGuardCreate.mockResolvedValueOnce({ snapshot: mockSnapshot });
      mockSnapshot.mockResolvedValueOnce('botguard-response');

      await expect(service.onModuleInit()).rejects.toThrow(
        'Could not get BotGuard integrity token',
      );
    });

    it('falls back to the TV challenge when the homepage has no ytcfg', async () => {
      mockInnertubeCreate
        .mockResolvedValueOnce(createClient('visitor-data-1', 'bootstrap'))
        .mockResolvedValueOnce(createClient('visitor-data-1', 'tokenized'));
      mockFetch
        .mockResolvedValueOnce(
          createTextResponse(
            `<script>window.ytAtN(${JSON.stringify({ R: { bgChallenge: createChallenge() } })})</script>`,
          ),
        )
        .mockResolvedValueOnce(createTextResponse(createTvConfig()))
        .mockResolvedValueOnce(
          createTextResponse('globalThis.__bg_vm_loaded = true;'),
        )
        .mockResolvedValueOnce(createJsonResponse(['integrity-token', 60, 30]));
      mockBotGuardCreate.mockResolvedValueOnce({ snapshot: mockSnapshot });
      mockSnapshot.mockResolvedValueOnce('botguard-response');
      mockWebPoMinterCreate.mockResolvedValueOnce({
        mintAsWebsafeString: mockMintAsWebsafeString,
      });
      mockMintAsWebsafeString.mockResolvedValueOnce('session-po-token');

      await service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        'innertube.challenge.page_failed: Could not find ytcfg in page HTML',
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl',
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        'https://jnn-pa.example/GenerateIT',
        expect.objectContaining({
          body: JSON.stringify(['tv-request-key', 'botguard-response']),
        }),
      );
    });

    it('falls back to the TV challenge when the homepage has no initial attestation data', async () => {
      mockInnertubeCreate
        .mockResolvedValueOnce(createClient('visitor-data-1', 'bootstrap'))
        .mockResolvedValueOnce(createClient('visitor-data-1', 'tokenized'));
      mockFetch
        .mockResolvedValueOnce(
          createTextResponse(
            '<script>ytcfg.set({"EVENT_ID":"event"});</script>',
          ),
        )
        .mockResolvedValueOnce(createTextResponse(createTvConfig()))
        .mockResolvedValueOnce(
          createTextResponse('globalThis.__bg_vm_loaded = true;'),
        )
        .mockResolvedValueOnce(createJsonResponse(['integrity-token', 60, 30]));
      mockBotGuardCreate.mockResolvedValueOnce({ snapshot: mockSnapshot });
      mockSnapshot.mockResolvedValueOnce('botguard-response');
      mockWebPoMinterCreate.mockResolvedValueOnce({
        mintAsWebsafeString: mockMintAsWebsafeString,
      });
      mockMintAsWebsafeString.mockResolvedValueOnce('session-po-token');

      await service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        'innertube.challenge.page_failed: Could not find initial attestation challenge in page HTML',
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl',
        expect.anything(),
      );
    });

    it('rejects without logging session initialization when page and TV challenges fail', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'bootstrap'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse('<html></html>'))
        .mockResolvedValueOnce(createTextResponse('', false, 503));

      await expect(service.onModuleInit()).rejects.toThrow(
        'YouTube TV config returned 503',
      );

      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('innertube.session.init'),
      );
    });
  });

  describe('getClient', () => {
    it('returns the cached Innertube client', async () => {
      const client = queueSessionBuild('visitor-data-1', 'po-token-1', 'init');

      await service.onModuleInit();

      expect(service.getClient()).toBe(client);
    });

    it('returns undefined before initialization', () => {
      expect(service.getClient()).toBeUndefined();
      expect(service.getSessionPoToken()).toBeUndefined();
    });
  });

  describe('generateContentPoToken', () => {
    it('throws before the WebPo minter is ready', async () => {
      await expect(
        service.generateContentPoToken('dQw4w9WgXcQ'),
      ).rejects.toThrow('Innertube session not ready');
    });

    it('generates a content-bound PoToken for a video id without rebuilding the Innertube client', async () => {
      queueSessionBuild('visitor-data-1', 'session-po-token-1', 'init');
      await service.onModuleInit();
      mockMintAsWebsafeString.mockResolvedValueOnce('content-po-token');

      await expect(service.generateContentPoToken('dQw4w9WgXcQ')).resolves.toBe(
        'content-po-token',
      );

      expect(mockJSDOMConstructor).toHaveBeenCalledTimes(1);
      expect(mockMintAsWebsafeString).toHaveBeenLastCalledWith('dQw4w9WgXcQ');
      expect(mockInnertubeCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('logs the reason, regenerates WebPo minter and visitor data, and rebuilds the client', async () => {
      const initialClient = queueSessionBuild(
        'visitor-data-1',
        'po-token-1',
        'init',
      );
      await service.onModuleInit();
      expect(service.getClient()).toBe(initialClient);

      const refreshedClient = queueSessionBuild(
        'visitor-data-2',
        'po-token-2',
        'refresh',
      );

      await service.refresh('stream requested a new session token');

      expect(warnSpy).toHaveBeenCalledWith(
        'innertube.session.refresh: stream requested a new session token',
      );
      expect(mockJSDOMConstructor).toHaveBeenCalledTimes(1);
      expect(mockMintAsWebsafeString).toHaveBeenLastCalledWith(
        'visitor-data-2',
      );
      expect(service.getClient()).toBe(refreshedClient);
      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).toHaveBeenLastCalledWith(
        expect.stringMatching(
          /^innertube\.session\.init \[\d+ms, logged_in=false\]$/,
        ),
      );
    });

    it('shares one in-flight refresh across concurrent callers', async () => {
      const refreshedClient = queueSessionBuild(
        'visitor-data-1',
        'po-token-1',
        'concurrent',
      );

      await Promise.all([
        service.refresh('concurrent refresh'),
        service.refresh('concurrent refresh'),
        service.refresh('concurrent refresh'),
      ]);

      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(mockInnertubeCreate).toHaveBeenCalledTimes(2);
      expect(mockWebPoMinterCreate).toHaveBeenCalledTimes(1);
      expect(service.getClient()).toBe(refreshedClient);
    });

    it('propagates refresh failures, logs them, and keeps the cached client unchanged', async () => {
      const initialClient = queueSessionBuild(
        'visitor-data-1',
        'po-token-1',
        'init',
      );
      await service.onModuleInit();
      const failure = new Error('BotGuard unavailable');
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-2', 'refresh-bootstrap'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse(createPageHtml()))
        .mockResolvedValueOnce(
          createTextResponse('globalThis.__bg_vm_loaded = true;'),
        );
      mockBotGuardCreate.mockRejectedValueOnce(failure);

      await expect(
        service.refresh('token rejected by YouTube'),
      ).rejects.toThrow('BotGuard unavailable');

      expect(errorSpy).toHaveBeenCalledWith(
        'innertube.session.refresh.failed',
        failure.stack,
      );
      expect(service.getClient()).toBe(initialClient);

      const retriedClient = queueSessionBuild(
        'visitor-data-3',
        'po-token-3',
        'retry',
      );
      await expect(
        service.refresh('retry after failure'),
      ).resolves.toBeUndefined();
      expect(service.getClient()).toBe(retriedClient);
    });

    it('logs non-Error refresh failures without replacing an empty cache', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'refresh-bootstrap'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse(createPageHtml()))
        .mockResolvedValueOnce(
          createTextResponse('globalThis.__bg_vm_loaded = true;'),
        );
      mockBotGuardCreate.mockRejectedValueOnce('BotGuard failed');

      await expect(service.refresh('startup refresh')).rejects.toBe(
        'BotGuard failed',
      );

      expect(errorSpy).toHaveBeenCalledWith(
        'innertube.session.refresh.failed',
        'BotGuard failed',
      );
      expect(service.getClient()).toBeUndefined();
    });
  });

  describe('scheduledRefresh', () => {
    it('runs a scheduled proactive refresh that rebuilds the session', async () => {
      const refreshedClient = queueSessionBuild(
        'visitor-data-2',
        'po-token-2',
        'scheduled',
      );

      await service.scheduledRefresh();

      expect(warnSpy).toHaveBeenCalledWith(
        'innertube.session.refresh: scheduled session refresh',
      );
      expect(service.getClient()).toBe(refreshedClient);
    });

    it('swallows scheduled refresh failures after logging them', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'refresh-bootstrap'),
      );
      mockFetch
        .mockResolvedValueOnce(createTextResponse(createPageHtml()))
        .mockResolvedValueOnce(
          createTextResponse('globalThis.__bg_vm_loaded = true;'),
        );
      mockBotGuardCreate.mockRejectedValueOnce('BotGuard failed');

      await expect(service.scheduledRefresh()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        'innertube.session.refresh.failed',
        expect.any(String),
      );
    });
  });
});
