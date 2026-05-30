import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface InnertubeCreateOptions {
  generate_session_locally?: boolean;
  po_token?: string;
  visitor_data?: string;
}

interface MockInnertubeClient {
  readonly label: string;
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
  };
}

const { mockInnertubeCreate, mockPoTokenGenerate, mockJSDOMConstructor } =
  vi.hoisted(() => ({
    mockInnertubeCreate: vi.fn(),
    mockPoTokenGenerate: vi.fn(),
    mockJSDOMConstructor: vi.fn(),
  }));

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: mockInnertubeCreate,
  },
}));

vi.mock('bgutils-js', () => ({
  default: {
    PoToken: {
      generate: mockPoTokenGenerate,
    },
  },
}));

vi.mock('jsdom', () => ({
  JSDOM: mockJSDOMConstructor,
}));

import { InnertubeSessionService } from './innertube-session.service';

function createClient(
  visitorData: string | undefined,
  label: string,
): MockInnertubeClient {
  const client = visitorData === undefined ? {} : { visitorData };

  return {
    label,
    session: {
      context: {
        client,
      },
    },
  };
}

function createDom(label: string): MockDom {
  return {
    window: {
      label,
      document: {
        label: `${label}-document`,
      },
    },
  };
}

function queueSessionBuild(
  visitorData: string,
  poToken: string,
  label: string,
): MockInnertubeClient {
  const bootstrapClient = createClient(visitorData, `${label}-bootstrap`);
  const tokenizedClient = createClient(visitorData, `${label}-tokenized`);

  mockInnertubeCreate
    .mockResolvedValueOnce(bootstrapClient)
    .mockResolvedValueOnce(tokenizedClient);
  mockPoTokenGenerate.mockResolvedValueOnce(poToken);

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
    vi.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('creates a jsdom window, generates a PoToken, creates and caches the Innertube client', async () => {
      const client = queueSessionBuild('visitor-data-1', 'po-token-1', 'init');

      await service.onModuleInit();

      expect(mockJSDOMConstructor).toHaveBeenCalledTimes(1);
      expect(globalThis.window).toBe(dom.window);
      expect(globalThis.document).toBe(dom.window.document);
      expect(mockPoTokenGenerate).toHaveBeenCalledWith({
        identifier: 'visitor-data-1',
      });
      expect(mockInnertubeCreate).toHaveBeenNthCalledWith(1, {
        generate_session_locally: true,
      } satisfies InnertubeCreateOptions);
      expect(mockInnertubeCreate).toHaveBeenNthCalledWith(2, {
        generate_session_locally: true,
        po_token: 'po-token-1',
        visitor_data: 'visitor-data-1',
      } satisfies InnertubeCreateOptions);
      expect(service.getClient()).toBe(client);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^innertube\.session\.init \[\d+ms\]$/),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('po-token-1'),
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

      expect(mockPoTokenGenerate).not.toHaveBeenCalled();
      expect(service.getClient()).toBeUndefined();
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
    });
  });

  describe('refresh', () => {
    it('logs the reason, regenerates PoToken and visitor data, and rebuilds the client', async () => {
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
      expect(mockPoTokenGenerate).toHaveBeenLastCalledWith({
        identifier: 'visitor-data-2',
      });
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
      expect(mockPoTokenGenerate).toHaveBeenCalledTimes(1);
      expect(service.getClient()).toBe(refreshedClient);
    });

    it('propagates refresh failures, logs them, and keeps the cached client unchanged', async () => {
      const initialClient = queueSessionBuild(
        'visitor-data-1',
        'po-token-1',
        'init',
      );
      await service.onModuleInit();
      const failure = new Error('bgutils unavailable');
      mockInnertubeCreate.mockResolvedValueOnce(
        createClient('visitor-data-2', 'refresh-bootstrap'),
      );
      mockPoTokenGenerate.mockRejectedValueOnce(failure);

      await expect(
        service.refresh('token rejected by YouTube'),
      ).rejects.toThrow('bgutils unavailable');

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
      mockPoTokenGenerate.mockRejectedValueOnce('bgutils failed');

      await expect(service.refresh('startup refresh')).rejects.toBe(
        'bgutils failed',
      );

      expect(errorSpy).toHaveBeenCalledWith(
        'innertube.session.refresh.failed',
        'bgutils failed',
      );
      expect(service.getClient()).toBeUndefined();
    });
  });
});
