import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import BotGuard from 'bgutils-js';
import { JSDOM } from 'jsdom';
import { Innertube } from 'youtubei.js';

interface SessionPoTokenGenerator {
  readonly PoToken: {
    readonly generate: (args: {
      readonly identifier: string;
    }) => Promise<string>;
  };
}

@Injectable()
export class InnertubeSessionService implements OnModuleInit {
  private readonly logger = new Logger(InnertubeSessionService.name);
  private client: Innertube | undefined;
  private poToken: string | undefined;
  private visitorData: string | undefined;
  private refreshPromise: Promise<void> | undefined;
  private dom: JSDOM | undefined;

  public async onModuleInit(): Promise<void> {
    await this.initSession();
  }

  public getClient(): Innertube | undefined {
    if (!this.client || !this.poToken || !this.visitorData) {
      return undefined;
    }

    return this.client;
  }

  public async refresh(reason: string): Promise<void> {
    this.logger.warn(`innertube.session.refresh: ${reason}`);

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.initSession()
      .catch((error: unknown) => {
        this.logger.error(
          'innertube.session.refresh.failed',
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });

    return this.refreshPromise;
  }

  private async initSession(): Promise<void> {
    const startedAt = Date.now();
    this.ensureDom();

    const bootstrapClient = await Innertube.create({
      generate_session_locally: true,
    });
    const visitorData = this.extractVisitorData(bootstrapClient);
    const poToken = await this.generatePoToken(visitorData);
    const client = await Innertube.create({
      generate_session_locally: true,
      po_token: poToken,
      visitor_data: visitorData,
    });

    this.client = client;
    this.poToken = poToken;
    this.visitorData = visitorData;
    this.logger.log(
      `innertube.session.init [${String(Date.now() - startedAt)}ms]`,
    );
  }

  private ensureDom(): void {
    this.dom ??= new JSDOM();

    Object.assign(globalThis, {
      window: this.dom.window,
      document: this.dom.window.document,
    });
  }

  private extractVisitorData(client: Innertube): string {
    const visitorData = client.session.context.client.visitorData;

    if (!visitorData) {
      throw new Error('Innertube session did not provide visitor_data');
    }

    return visitorData;
  }

  private async generatePoToken(visitorData: string): Promise<string> {
    const tokenGenerator = BotGuard as unknown as SessionPoTokenGenerator;
    return tokenGenerator.PoToken.generate({ identifier: visitorData });
  }
}
