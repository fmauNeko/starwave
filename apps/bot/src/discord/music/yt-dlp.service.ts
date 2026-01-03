import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Config } from '../../config/config.type';
import { execYtDlp } from './yt-dlp.util';

const YT_DLP_GITHUB_API =
  'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const VERSION_FILE = 'yt-dlp-version.txt';

export interface YtDlpVideoInfo {
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
}

export interface YtDlpAudioInfo {
  url: string;
  codec: string;
  container: string;
}

@Injectable()
export class YtDlpService implements OnModuleInit {
  private readonly logger = new Logger(YtDlpService.name);
  private readonly binDir: string;
  private readonly binaryPath: string;
  private readonly versionPath: string;
  private readonly cookiesPath: string | undefined;
  private isReady = false;

  public constructor(private readonly configService: ConfigService<Config>) {
    this.binDir = join(process.cwd(), '.yt-dlp');
    this.binaryPath = join(this.binDir, this.getBinaryName());
    this.versionPath = join(this.binDir, VERSION_FILE);
    this.cookiesPath = this.configService.get('youtube', {
      infer: true,
    })?.cookiesPath;
  }

  public async onModuleInit(): Promise<void> {
    await this.ensureBinaryReady();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  public async checkForUpdates(): Promise<void> {
    this.logger.log('Checking for yt-dlp updates...');

    try {
      const latestVersion = await this.fetchLatestVersion();
      const currentVersion = await this.getCurrentVersion();

      if (currentVersion && currentVersion === latestVersion) {
        this.logger.log(`yt-dlp is up to date (${currentVersion})`);
        return;
      }

      this.logger.log(
        `Updating yt-dlp from ${currentVersion ?? 'unknown'} to ${latestVersion}`,
      );
      await this.downloadBinary(latestVersion);
      this.logger.log(`yt-dlp updated to ${latestVersion}`);
    } catch (error) {
      this.logger.error(
        'Failed to check for yt-dlp updates',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  public async getVideoInfo(url: string): Promise<YtDlpVideoInfo> {
    this.ensureReady();

    const args = [
      '--dump-json',
      '--no-download',
      ...this.getCookiesArgs(),
      ...this.getExtractorArgs(),
      url,
    ];

    const output = await execYtDlp(this.binaryPath, args);
    const info = JSON.parse(output) as {
      title?: string;
      duration?: number;
      thumbnail?: string;
      thumbnails?: { url: string }[];
    };

    return {
      title: info.title ?? 'Unknown Title',
      duration: info.duration ?? 0,
      thumbnail: info.thumbnail ?? info.thumbnails?.[0]?.url ?? '',
      url,
    };
  }

  public async getAudioUrl(url: string): Promise<string> {
    const info = await this.getAudioInfo(url);
    return info.url;
  }

  public async getAudioInfo(url: string): Promise<YtDlpAudioInfo> {
    this.ensureReady();

    // Prefer Opus codec for Discord passthrough, fallback to best audio
    const args = [
      '-f',
      'bestaudio[acodec=opus]/bestaudio',
      '--print',
      '%(urls)s',
      '--print',
      '%(acodec)s',
      '--print',
      '%(ext)s',
      ...this.getCookiesArgs(),
      ...this.getExtractorArgs(),
      url,
    ];

    const output = await execYtDlp(this.binaryPath, args);
    const lines = output.trim().split('\n');

    const audioUrl = lines[0]?.trim();
    if (!audioUrl) {
      throw new Error('yt-dlp returned empty URL');
    }

    return {
      url: audioUrl,
      codec: lines[1]?.trim() ?? 'unknown',
      container: lines[2]?.trim() ?? 'unknown',
    };
  }

  public async forceUpdate(): Promise<void> {
    const latestVersion = await this.fetchLatestVersion();
    await this.downloadBinary(latestVersion);
    this.logger.log(`yt-dlp force updated to ${latestVersion}`);
  }

  private async ensureBinaryReady(): Promise<void> {
    try {
      await mkdir(this.binDir, { recursive: true });

      if (!existsSync(this.binaryPath)) {
        this.logger.log('yt-dlp binary not found, downloading...');
        const latestVersion = await this.fetchLatestVersion();
        await this.downloadBinary(latestVersion);
        this.logger.log(`yt-dlp ${latestVersion} downloaded successfully`);
      } else {
        const version = await this.getCurrentVersion();
        this.logger.log(
          `yt-dlp binary ready (version: ${version ?? 'unknown'})`,
        );
      }

      this.isReady = true;
    } catch (error) {
      this.logger.error(
        'Failed to initialize yt-dlp binary',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private ensureReady(): void {
    if (!this.isReady) {
      throw new Error('yt-dlp binary not ready. Wait for initialization.');
    }
  }

  private async fetchLatestVersion(): Promise<string> {
    const response = await fetch(YT_DLP_GITHUB_API, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'starwave-bot',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${String(response.status)}`);
    }

    const data = (await response.json()) as { tag_name: string };
    return data.tag_name;
  }

  private async getCurrentVersion(): Promise<string | undefined> {
    try {
      const version = await readFile(this.versionPath, 'utf-8');
      return version.trim();
    } catch {
      return undefined;
    }
  }

  private async downloadBinary(version: string): Promise<void> {
    const downloadUrl = this.getDownloadUrl(version);
    this.logger.debug(`Downloading yt-dlp from ${downloadUrl}`);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download yt-dlp: ${String(response.status)}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error('Response body is empty');
    }

    const tempPath = join(tmpdir(), `yt-dlp-${String(Date.now())}`);
    const nodeStream = Readable.fromWeb(
      body as Parameters<typeof Readable.fromWeb>[0],
    );
    await pipeline(nodeStream, createWriteStream(tempPath));

    if (process.platform !== 'win32') {
      await chmod(tempPath, 0o755);
    }

    await mkdir(dirname(this.binaryPath), { recursive: true });

    try {
      await unlink(this.binaryPath);
    } catch {
      // Expected when binary doesn't exist yet
    }

    await copyFile(tempPath, this.binaryPath);
    await unlink(tempPath);
    await writeFile(this.versionPath, version);
  }

  private getBinaryName(): string {
    switch (process.platform) {
      case 'win32':
        return 'yt-dlp.exe';
      case 'darwin':
        return 'yt-dlp_macos';
      default:
        return this.isMuslLibc() ? 'yt-dlp_musllinux' : 'yt-dlp_linux';
    }
  }

  private isMuslLibc(): boolean {
    try {
      const memoryMappings = readFileSync('/proc/self/maps', 'utf-8');
      return memoryMappings.includes('musl');
    } catch {
      return existsSync('/etc/alpine-release');
    }
  }

  private getDownloadUrl(version: string): string {
    const binaryName = this.getBinaryName();
    return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${binaryName}`;
  }

  private getCookiesArgs(): string[] {
    if (this.cookiesPath && existsSync(this.cookiesPath)) {
      return ['--cookies', this.cookiesPath];
    }
    return [];
  }

  private getExtractorArgs(): string[] {
    return ['--js-runtimes', 'node'];
  }
}
