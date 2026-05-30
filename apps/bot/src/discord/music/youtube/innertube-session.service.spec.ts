import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface InnertubeCreateOptions {
  enable_session_cache?: boolean;
  generate_session_locally?: boolean;
  po_token?: string;
  user_agent?: string;
  visitor_data?: string;
}

interface MockInnertubeClient {
  readonly label: string;
  readonly getAttestationChallenge: ReturnType<typeof vi.fn>;
  readonly session: {
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
  };
}

const {
  mockBotGuardCreate,
  mockBuildURL,
  mockFetch,
  mockInnertubeCreate,
  mockJSDOMConstructor,
  mockMintAsWebsafeString,
  mockSnapshot,
  mockWebPoMinterCreate,
} = vi.hoisted(() => ({
  mockBotGuardCreate: vi.fn(),
  mockBuildURL: vi.fn(),
  mockFetch: vi.fn(),
  mockInnertubeCreate: vi.fn(),
  mockJSDOMConstructor: vi.fn(),
  mockMintAsWebsafeString: vi.fn(),
  mockSnapshot: vi.fn(),
  mockWebPoMinterCreate: vi.fn(),
}));

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: mockInnertubeCreate,
  },
}));

vi.mock('bgutils-js', () => ({
  BG: {
    BotGuardClient: {
      create: mockBotGuardCreate,
    },
    WebPoMinter: {
      create: mockWebPoMinterCreate,
    },
  },
  GOOG_API_KEY: 'test-api-key',
  USER_AGENT: 'test-user-agent',
  buildURL: mockBuildURL,
}));

vi.mock('jsdom', () => ({
  JSDOM: mockJSDOMConstructor,
}));

import { InnertubeSessionService } from './innertube-session.service';

const originalFetch = global.fetch;

function createClient(
  visitorData: string | undefined,
  label: string,
  bgChallenge: unknown = createChallenge(),
): MockInnertubeClient {
  const client = visitorData === undefined ? {} : { visitorData };

  return {
    label,
    getAttestationChallenge: vi.fn().mockResolvedValue({
      bg_challenge: bgChallenge,
    }),
    session: {
      context: {
        client,
      },
    },
  };
}

function createChallenge() {
  return {
    client_experiments_state_blob: 'experiments',
    global_name: 'BG_VM',
    interpreter_hash: 'interpreter-hash',
    interpreter_url: {
      private_do_not_access_or_else_trusted_resource_url_wrapped_value:
        '//example.com/interpreter.js',
    },
    program: 'program',
  };
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
): MockInnertubeClient {
  const bootstrapClient = createClient(visitorData, `${label}-bootstrap`);
  const tokenizedClient = createClient(visitorData, `${label}-tokenized`);

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

  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'location');
    Reflect.deleteProperty(globalThis, 'origin');
    Reflect.deleteProperty(globalThis, '__bg_vm_loaded');

    global.fetch = mockFetch;
    mockBuildURL.mockReturnValue('https://jnn-pa.example/GenerateIT');
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

    service = new InnertubeSessionService();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'location');
    Reflect.deleteProperty(globalThis, 'origin');
    Reflect.deleteProperty(globalThis, '__bg_vm_loaded');
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
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/interpreter.js',
      );
      expect(mockBotGuardCreate).toHaveBeenCalledWith({
        globalName: 'BG_VM',
        globalObj: globalThis,
        program: 'program',
      });
      expect(mockSnapshot).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        webPoSignalOutput: expect.any(Array),
      });
      expect(mockBuildURL).toHaveBeenCalledWith('GenerateIT', true);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://jnn-pa.example/GenerateIT',
        expect.objectContaining({
          body: JSON.stringify(['O43z0dpjhgX20SCx4KAo', 'botguard-response']),
          method: 'POST',
        }),
      );
      expect(mockWebPoMinterCreate).toHaveBeenCalledWith(
        { integrityToken: 'integrity-token' },
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
      expect(service.getClient()).toBe(client);
      expect(service.getSessionPoToken()).toBe('session-po-token-1');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^innertube\.session\.init \[\d+ms\]$/),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('session-po-token-1'),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('visitor-data-1'),
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

    it('rejects if the attestation challenge is missing', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'missing-challenge', null),
      );

      await expect(service.onModuleInit()).rejects.toThrow(
        'Innertube attestation challenge missing',
      );
      expect(service.getClient()).toBeUndefined();
    });

    it('rejects if the BotGuard interpreter fetch fails', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'bad-interpreter'),
      );
      mockFetch.mockResolvedValueOnce(createTextResponse('', false, 503));

      await expect(service.onModuleInit()).rejects.toThrow(
        'Failed to fetch BotGuard interpreter: 503',
      );
    });

    it('rejects if the integrity token response is malformed', async () => {
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-1', 'bad-integrity'),
      );
      mockFetch
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
        expect.stringMatching(/^innertube\.session\.init \[\d+ms\]$/),
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
      mockFetch.mockResolvedValueOnce(
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
      mockFetch.mockResolvedValueOnce(
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
});
