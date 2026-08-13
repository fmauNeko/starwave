import { existsSync, readFileSync } from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { BotGuardClient } from 'bgutils-js/botguard';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import {
  USER_AGENT,
  buildURL,
  getHeaders,
  parseLooseJSON,
} from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';
import { Innertube } from 'youtubei.js';
import type { Config } from '../../../config/config.type';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const BOTGUARD_FETCH_TIMEOUT_MS = 10_000;
const TV_CONFIG_URL =
  'https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl';
const TV_USER_AGENT =
  'Mozilla/5.0 (Linux arm64-v8a; Android 10) Cobalt/25.lts.30.1034958-gold (unlike Gecko) v8/8.8.278.17-jit gles Starboard/15, Sony_ATV_sdm845_13140765/52.1.C.0.268 (KDDI, SOV38) com.google.android.youtube.tv/5.30.301';
const SESSION_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours — BotGuard integrity tokens expire well beyond this

interface RawBgChallenge {
  readonly program: string;
  readonly globalName: string;
  readonly interpreterUrl?: {
    readonly privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string;
  };
}

@Injectable()
export class InnertubeSessionService implements OnModuleInit {
  private readonly logger = new Logger(InnertubeSessionService.name);
  private client: Innertube | undefined;
  private sessionPoToken: string | undefined;
  private visitorData: string | undefined;
  private webPoMinter: WebPoMinter | undefined;
  private refreshPromise: Promise<void> | undefined;
  private dom: JSDOM | undefined;

  public constructor(private readonly configService: ConfigService<Config>) {}

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

  @Interval(SESSION_REFRESH_INTERVAL_MS)
  public async scheduledRefresh(): Promise<void> {
    try {
      await this.refresh('scheduled session refresh');
    } catch {
      // refresh() already logged the failure; a scheduled handler must never throw.
    }
  }

  private async initSession(): Promise<void> {
    const startedAt = Date.now();
    this.ensureDom();
    const cookiesPath = this.configService.get('youtube', {
      infer: true,
    })?.cookiesPath;
    const cookie = this.loadCookieHeader(cookiesPath);

    const bootstrapClient = await Innertube.create({
      enable_session_cache: false,
      generate_session_locally: true,
      user_agent: USER_AGENT,
      ...(cookie ? { cookie } : {}),
    });
    const visitorData = this.extractVisitorData(bootstrapClient);
    const webPoMinter = await this.createWebPoMinter();
    const sessionPoToken = await webPoMinter.mintAsWebsafeString(visitorData);
    const client = await Innertube.create({
      enable_session_cache: false,
      generate_session_locally: true,
      po_token: sessionPoToken,
      user_agent: USER_AGENT,
      visitor_data: visitorData,
      ...(cookie ? { cookie } : {}),
    });

    this.client = client;
    this.sessionPoToken = sessionPoToken;
    this.visitorData = visitorData;
    this.webPoMinter = webPoMinter;
    this.logger.log(
      `innertube.session.init [${String(Date.now() - startedAt)}ms, logged_in=${String(client.session.logged_in)}]`,
    );
  }

  private loadCookieHeader(
    cookiesPath: string | undefined,
  ): string | undefined {
    if (!cookiesPath || !existsSync(cookiesPath)) {
      return undefined;
    }

    try {
      const cookies = readFileSync(cookiesPath, 'utf8')
        .split(/\r?\n/u)
        .flatMap((rawLine) => this.parseCookieLine(rawLine));

      return cookies.length > 0 ? cookies.join('; ') : undefined;
    } catch (error) {
      this.logger.warn(
        `innertube.cookies.read_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private parseCookieLine(rawLine: string): string[] {
    const line = rawLine.trim();

    if (!line) {
      return [];
    }

    const cookieLine = line.startsWith('#HttpOnly_')
      ? line.slice('#HttpOnly_'.length)
      : line;

    if (cookieLine.startsWith('#')) {
      return [];
    }

    const fields = cookieLine.split('\t');
    if (fields.length < 7) {
      return [];
    }

    const [domain] = fields;
    const name = fields[5];
    const value = fields[6];
    if (!domain || !name || value === undefined) {
      return [];
    }

    if (!domain.includes('youtube.com') && !domain.includes('google.com')) {
      return [];
    }

    return [`${name}=${value}`];
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

    /* v8 ignore next 6 */
    if (!Reflect.has(globalThis, 'navigator')) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: this.dom.window.navigator,
      });
    }
  }

  private setYtConfig(config: Record<string, unknown>): void {
    const yt = { config_: config };
    Object.assign(this.dom?.window ?? {}, { yt });
    Object.assign(globalThis, { yt });
  }

  private extractVisitorData(client: Innertube): string {
    const visitorData = client.session.context.client.visitorData;

    if (!visitorData) {
      throw new Error('Innertube session did not provide visitor_data');
    }

    return visitorData;
  }

  private async createWebPoMinter(): Promise<WebPoMinter> {
    const { challenge, requestKey } = await this.fetchAttestationChallenge();
    const interpreterUrl =
      challenge.interpreterUrl
        ?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    if (!interpreterUrl) {
      throw new Error('Innertube attestation interpreter URL missing');
    }

    const bgScriptResponse = await fetch(`https:${interpreterUrl}`, {
      signal: AbortSignal.timeout(BOTGUARD_FETCH_TIMEOUT_MS),
    });
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

    const botguard = await BotGuardClient.create({
      globalName: challenge.globalName,
      globalObject: globalThis,
      program: challenge.program,
    });
    const webPoSignalOutput: WebPoSignalOutput = [];
    const botguardResponse = await botguard.snapshot({ webPoSignalOutput });
    const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
      body: JSON.stringify([requestKey, botguardResponse]),
      headers: getHeaders(),
      method: 'POST',
      signal: AbortSignal.timeout(BOTGUARD_FETCH_TIMEOUT_MS),
    });
    const [
      integrityToken,
      estimatedTtlSecs,
      mintRefreshThreshold,
      websafeFallbackToken,
    ] = (await integrityTokenResponse.json()) as [
      string,
      number,
      number,
      string?,
    ];

    if (typeof integrityToken !== 'string') {
      throw new Error('Could not get BotGuard integrity token');
    }

    return WebPoMinter.create(
      {
        integrityToken,
        estimatedTtlSecs,
        mintRefreshThreshold,
        ...(websafeFallbackToken === undefined ? {} : { websafeFallbackToken }),
      },
      webPoSignalOutput,
    );
  }

  private async fetchAttestationChallenge(): Promise<{
    challenge: RawBgChallenge;
    requestKey: string;
  }> {
    try {
      return await this.fetchPageChallenge();
    } catch (error: unknown) {
      this.logger.warn(
        `innertube.challenge.page_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.fetchTvChallenge();
    }
  }

  private async fetchPageChallenge(): Promise<{
    challenge: RawBgChallenge;
    requestKey: string;
  }> {
    const response = await fetch('https://www.youtube.com', {
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.7',
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(BOTGUARD_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`YouTube homepage returned ${String(response.status)}`);
    }

    const html = await response.text();
    const ytConfigRaw = /ytcfg\.set\(({.+?})\);/s.exec(html)?.[1];
    if (!ytConfigRaw) {
      throw new Error('Could not find ytcfg in page HTML');
    }
    this.setYtConfig(JSON.parse(ytConfigRaw) as Record<string, unknown>);

    const initial = /window\.ytAtN\(\s*({[\s\S]*?})\s*\)/.exec(html)?.[1];
    if (!initial) {
      throw new Error(
        'Could not find initial attestation challenge in page HTML',
      );
    }

    const challenge = (
      parseLooseJSON(initial)['R'] as
        { readonly bgChallenge?: RawBgChallenge } | undefined
    )?.bgChallenge;
    if (!challenge) {
      throw new Error('Initial attestation data has no bgChallenge');
    }

    return { challenge, requestKey: REQUEST_KEY };
  }

  private async fetchTvChallenge(): Promise<{
    challenge: RawBgChallenge;
    requestKey: string;
  }> {
    const response = await fetch(TV_CONFIG_URL, {
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': TV_USER_AGENT,
      },
      signal: AbortSignal.timeout(BOTGUARD_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`YouTube TV config returned ${String(response.status)}`);
    }

    const body = await response.text();
    if (!body.startsWith(")]}'")) {
      throw new Error('Unexpected YouTube TV config response');
    }

    const config = JSON.parse(body.slice(4)) as {
      readonly challengeParams?: { readonly R?: string };
      readonly challengeRequestKey?: string;
    };
    const raw = config.challengeParams?.R;
    const requestKey = config.challengeRequestKey;
    if (!raw || !requestKey) {
      throw new Error('YouTube TV config has no challenge');
    }

    const challenge = (
      JSON.parse(raw) as { readonly bgChallenge?: RawBgChallenge }
    ).bgChallenge;
    if (!challenge) {
      throw new Error('YouTube TV config challenge has no bgChallenge');
    }

    return { challenge, requestKey };
  }
}
