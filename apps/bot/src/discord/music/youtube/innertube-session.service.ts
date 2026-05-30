import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BG,
  GOOG_API_KEY,
  USER_AGENT,
  buildURL,
  type WebPoSignalOutput,
} from 'bgutils-js';
import { JSDOM } from 'jsdom';
import { Innertube } from 'youtubei.js';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

type WebPoMinter = Awaited<ReturnType<typeof BG.WebPoMinter.create>>;

@Injectable()
export class InnertubeSessionService implements OnModuleInit {
  private readonly logger = new Logger(InnertubeSessionService.name);
  private client: Innertube | undefined;
  private sessionPoToken: string | undefined;
  private visitorData: string | undefined;
  private webPoMinter: WebPoMinter | undefined;
  private refreshPromise: Promise<void> | undefined;
  private dom: JSDOM | undefined;

  public async onModuleInit(): Promise<void> {
    await this.initSession();
  }

  public getClient(): Innertube | undefined {
    if (!this.client || !this.sessionPoToken || !this.visitorData) {
      return undefined;
    }

    return this.client;
  }

  public getSessionPoToken(): string | undefined {
    return this.sessionPoToken;
  }

  public async generateContentPoToken(videoId: string): Promise<string> {
    if (!this.webPoMinter) {
      throw new Error('Innertube session not ready');
    }

    return this.webPoMinter.mintAsWebsafeString(videoId);
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
      enable_session_cache: false,
      generate_session_locally: true,
      user_agent: USER_AGENT,
    });
    const visitorData = this.extractVisitorData(bootstrapClient);
    const webPoMinter = await this.createWebPoMinter(bootstrapClient);
    const sessionPoToken = await webPoMinter.mintAsWebsafeString(visitorData);
    const client = await Innertube.create({
      enable_session_cache: false,
      generate_session_locally: true,
      po_token: sessionPoToken,
      user_agent: USER_AGENT,
      visitor_data: visitorData,
    });

    this.client = client;
    this.sessionPoToken = sessionPoToken;
    this.visitorData = visitorData;
    this.webPoMinter = webPoMinter;
    this.logger.log(
      `innertube.session.init [${String(Date.now() - startedAt)}ms]`,
    );
  }

  private ensureDom(): void {
    this.dom ??= new JSDOM(
      '<!DOCTYPE html><html lang="en"><head></head></html>',
      {
        referrer: 'https://www.youtube.com/',
        url: 'https://www.youtube.com/',
      },
    );

    Object.assign(globalThis, {
      document: this.dom.window.document,
      location: this.dom.window.location,
      origin: this.dom.window.origin,
      window: this.dom.window,
    });

    if (!Reflect.has(globalThis, 'navigator')) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: this.dom.window.navigator,
      });
    }
  }

  private extractVisitorData(client: Innertube): string {
    const visitorData = client.session.context.client.visitorData;

    if (!visitorData) {
      throw new Error('Innertube session did not provide visitor_data');
    }

    return visitorData;
  }

  private async createWebPoMinter(client: Innertube): Promise<WebPoMinter> {
    const challengeResponse = await client.getAttestationChallenge(
      'ENGAGEMENT_TYPE_UNBOUND',
    );
    const challenge = challengeResponse.bg_challenge;

    if (!challenge) {
      throw new Error('Innertube attestation challenge missing');
    }

    const interpreterUrl =
      challenge.interpreter_url
        .private_do_not_access_or_else_trusted_resource_url_wrapped_value;
    if (!interpreterUrl) {
      throw new Error('Innertube attestation interpreter URL missing');
    }

    const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
    if (!bgScriptResponse.ok) {
      throw new Error(
        `Failed to fetch BotGuard interpreter: ${String(bgScriptResponse.status)}`,
      );
    }

    const interpreterJavascript = await bgScriptResponse.text();
    if (!interpreterJavascript) {
      throw new Error('BotGuard interpreter was empty');
    }

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    new Function(interpreterJavascript)(); // Required: executes BotGuard interpreter downloaded from YouTube CDN

    const botguard = await BG.BotGuardClient.create({
      globalName: challenge.global_name,
      globalObj: globalThis,
      program: challenge.program,
    });
    const webPoSignalOutput: WebPoSignalOutput = [];
    const botguardResponse = await botguard.snapshot({ webPoSignalOutput });
    const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
      body: JSON.stringify([REQUEST_KEY, botguardResponse]),
      headers: {
        'content-type': 'application/json+protobuf',
        'user-agent': USER_AGENT,
        'x-goog-api-key': GOOG_API_KEY,
        'x-user-agent': 'grpc-web-javascript/0.1',
      },
      method: 'POST',
    });
    const integrityTokenJson =
      (await integrityTokenResponse.json()) as unknown[];
    const integrityToken = integrityTokenJson[0];

    if (typeof integrityToken !== 'string') {
      throw new Error('Could not get BotGuard integrity token');
    }

    return BG.WebPoMinter.create({ integrityToken }, webPoSignalOutput);
  }
}
