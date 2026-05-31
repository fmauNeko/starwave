import { describe, expect, it, vi } from 'vitest';

describe('Module imports', () => {
  it('imports app and discord modules without bootstrapping', async () => {
    vi.resetModules();

    let necordForRootAsyncOptions: unknown;

    vi.doMock('./config/configuration', () => ({
      default: () => ({
        discord: {
          devGuildIds: [],
          guildsSettings: {},
          token: 'test-token',
        },
      }),
      validateEnv: (env: unknown) => env,
    }));

    vi.doMock('./discord/music/yt-dlp.service', () => ({
      YtDlpService: class MockYtDlpService {
        public onModuleInit = vi.fn();
        public getVideoInfo = vi.fn();
        public getAudioUrl = vi.fn();
      },
    }));

    vi.doMock('./discord/music/youtube/innertube-session.service', () => ({
      InnertubeSessionService: class MockInnertubeSessionService {
        public onModuleInit = vi.fn().mockResolvedValue(undefined);
        public getClient = vi.fn().mockReturnValue(undefined);
        public getSessionPoToken = vi.fn().mockReturnValue(undefined);
        public generateContentPoToken = vi
          .fn()
          .mockResolvedValue('mock-po-token');
        public refresh = vi.fn().mockResolvedValue(undefined);
      },
    }));

    vi.doMock('./discord/music/youtube/youtube-stream.service', () => ({
      YouTubeStreamService: class MockYouTubeStreamService {
        public getMetadata = vi.fn().mockResolvedValue({
          title: 'Mock Video',
          duration: 180,
          thumbnail: '',
          url: 'https://www.youtube.com/watch?v=mock',
        });
        public search = vi.fn().mockResolvedValue({
          title: 'Mock Search',
          duration: 120,
          thumbnail: '',
          url: 'https://www.youtube.com/watch?v=mock2',
        });
        public getAudioStream = vi.fn().mockResolvedValue({
          source: 'https://mock.stream.url',
          streamType: 0,
        });
      },
    }));

    vi.doMock('@nestjs/schedule', () => ({
      ScheduleModule: {
        forRoot: () => ({
          module: function MockScheduleModule() {
            return undefined;
          },
        }),
      },
      Cron: () => () => undefined,
      CronExpression: {
        EVERY_DAY_AT_3AM: '0 3 * * *',
      },
    }));

    vi.doMock('necord', () => ({
      NecordModule: {
        forRootAsync: (options: unknown) => {
          necordForRootAsyncOptions = options;
          return {
            module: function MockNecordModule() {
              return undefined;
            },
          };
        },
      },
      Once: () => () => undefined,
      On: () => () => undefined,
      Context: () => () => undefined,
      Ctx: () => () => undefined,
      SlashCommand: () => () => undefined,
      Options: () => () => undefined,
      StringOption: () => () => undefined,
      IntegerOption: () => () => undefined,
      NumberOption: () => () => undefined,
      Button: () => () => undefined,
      createCommandGroupDecorator: () => () => (target: unknown) => target,
    }));

    const appModule = (await import('./app.module.js')) as unknown as {
      AppModule: unknown;
    };
    const discordModule =
      (await import('./discord/discord.module.js')) as unknown as {
        DiscordModule: unknown;
      };
    const authorizationModule =
      (await import('./discord/authorization/authorization.module.js')) as unknown as {
        AuthorizationModule: unknown;
      };
    const presenceModule =
      (await import('./discord/presence/presence.module.js')) as unknown as {
        PresenceModule: unknown;
      };

    expect(appModule.AppModule).toBeDefined();
    expect(discordModule.DiscordModule).toBeDefined();
    expect(authorizationModule.AuthorizationModule).toBeDefined();
    expect(presenceModule.PresenceModule).toBeDefined();

    expect(necordForRootAsyncOptions).toBeDefined();

    const options = necordForRootAsyncOptions as {
      useFactory?: (configService: {
        get: (key: string) => unknown;
      }) => unknown;
    };

    expect(options.useFactory).toBeTypeOf('function');

    const configService = {
      get: (key: string) => {
        if (key === 'discord.devGuildIds') return ['dev-guild'];
        if (key === 'discord.token') return 'token-from-config';
        return undefined;
      },
    };

    const necordConfig = options.useFactory?.(configService);
    expect(necordConfig).toMatchObject({
      development: ['dev-guild'],
      token: 'token-from-config',
    });
  }, 10000);
});
