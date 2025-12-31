import { Injectable, Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';

export interface FilteredStreamOptions {
  volume?: number;
  zmqBindAddress?: string;
}

const DEFAULT_VOLUME = 0.25;
const VOLUME_FILTER_NAME = 'volume@vol';

@Injectable()
export class AudioFilterService {
  private readonly logger = new Logger(AudioFilterService.name);

  public createFilteredStream(
    inputUrl: string,
    options: FilteredStreamOptions = {},
  ): Readable {
    const volume = options.volume ?? DEFAULT_VOLUME;

    this.logger.debug(`Applying volume filter: ${String(volume * 100)}%`);

    const ffmpeg = this.spawnFfmpeg(inputUrl, volume, options.zmqBindAddress);
    const outputStream = new PassThrough();

    ffmpeg.stdout?.pipe(outputStream);

    this.setupErrorHandlers(ffmpeg, outputStream);

    return outputStream;
  }

  private spawnFfmpeg(
    inputUrl: string,
    volume: number,
    zmqBindAddress?: string,
  ): ChildProcess {
    const audioFilter = this.buildAudioFilter(volume, zmqBindAddress);

    const args = [
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-i',
      inputUrl,
      '-af',
      audioFilter,
      '-f',
      'opus',
      '-c:a',
      'libopus',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-b:a',
      '96k',
      'pipe:1',
    ];

    return spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  private buildAudioFilter(volume: number, zmqBindAddress?: string): string {
    const volumeFilter = `${VOLUME_FILTER_NAME}=volume=${String(volume)}`;

    if (zmqBindAddress) {
      // FFmpeg filter syntax requires colons in filter arguments to be escaped.
      // We need a double backslash (`\\:`) in the final filter string, which is
      // represented here as `\\\\:` in the TypeScript string literal.
      const escapedAddress = zmqBindAddress.replace(/:/g, '\\\\:');
      return `azmq=bind_address=${escapedAddress},${volumeFilter}`;
    }

    return volumeFilter;
  }

  private setupErrorHandlers(
    ffmpeg: ChildProcess,
    outputStream: PassThrough,
  ): void {
    let stderrData = '';

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderrData += data.toString();
    });

    ffmpeg.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        const ffmpegError = new Error(
          'FFmpeg is not installed or not found in PATH. Please install FFmpeg to use music features.',
        );
        this.logger.error(ffmpegError.message);
        outputStream.destroy(ffmpegError);
      } else {
        this.logger.error('FFmpeg process error:', error);
        outputStream.destroy(error);
      }
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null) {
        this.logger.error(
          `FFmpeg exited with code ${String(code)}: ${stderrData}`,
        );
      }
    });

    outputStream.on('close', () => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGTERM');
      }
    });
  }
}
