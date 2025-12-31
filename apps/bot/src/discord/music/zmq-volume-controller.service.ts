import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Request } from 'zeromq';

const DEFAULT_VOLUME = 0.25;
const BASE_PORT = 5555;
const VOLUME_FILTER_NAME = 'volume@vol';
const COMMAND_TIMEOUT_MS = 5000;

interface GuildVolumeState {
  socket: Request;
  port: number;
  volume: number;
  connected: boolean;
}

@Injectable()
export class ZmqVolumeController implements OnModuleDestroy {
  private readonly logger = new Logger(ZmqVolumeController.name);
  private readonly guildStates = new Map<string, GuildVolumeState>();
  private readonly availablePorts: number[] = [];
  private nextPort = BASE_PORT;

  public onModuleDestroy(): void {
    for (const guildId of this.guildStates.keys()) {
      this.cleanup(guildId);
    }
  }

  public allocatePort(guildId: string): number {
    const existing = this.guildStates.get(guildId);
    if (existing) {
      return existing.port;
    }

    const port = this.availablePorts.pop() ?? this.nextPort++;
    this.guildStates.set(guildId, {
      socket: new Request(),
      port,
      volume: DEFAULT_VOLUME,
      connected: false,
    });

    this.logger.debug(
      `Allocated ZMQ port ${String(port)} for guild ${guildId}`,
    );
    return port;
  }

  public connect(guildId: string): void {
    const state = this.guildStates.get(guildId);
    if (!state) {
      throw new Error(`No port allocated for guild ${guildId}`);
    }

    if (state.connected) {
      return;
    }

    const address = `tcp://127.0.0.1:${String(state.port)}`;

    try {
      state.socket.connect(address);
      state.connected = true;
      this.logger.debug(`Connected to ZMQ at ${address} for guild ${guildId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to connect to ZMQ at ${address} for guild ${guildId}:`,
        error,
      );
      throw new Error(
        `Failed to connect ZMQ volume controller for guild ${guildId}: ${message}`,
      );
    }
  }

  public async setVolume(guildId: string, volume: number): Promise<number> {
    const state = this.guildStates.get(guildId);
    if (!state) {
      throw new Error(`No volume controller for guild ${guildId}`);
    }

    if (!state.connected) {
      throw new Error(`ZMQ not connected for guild ${guildId}`);
    }

    const clampedVolume = Math.max(0, Math.min(2, volume));
    const command = this.buildVolumeCommand(clampedVolume);
    this.logger.debug(`Sending ZMQ command: ${command}`);

    try {
      await state.socket.send(command);

      const response = await this.receiveWithTimeout(state.socket);
      this.logger.debug(`ZMQ response: ${response}`);

      if (response.startsWith('-')) {
        throw new Error(`FFmpeg error: ${response}`);
      }

      state.volume = clampedVolume;
      return clampedVolume;
    } catch (error) {
      this.logger.error(`Failed to set volume for guild ${guildId}:`, error);
      throw error;
    }
  }

  public getVolume(guildId: string): number {
    return this.guildStates.get(guildId)?.volume ?? DEFAULT_VOLUME;
  }

  public getBindAddress(guildId: string): string {
    const state = this.guildStates.get(guildId);
    if (!state) {
      throw new Error(`No port allocated for guild ${guildId}`);
    }
    return `tcp://*:${String(state.port)}`;
  }

  public hasController(guildId: string): boolean {
    return this.guildStates.has(guildId);
  }

  public isConnected(guildId: string): boolean {
    return this.guildStates.get(guildId)?.connected ?? false;
  }

  public cleanup(guildId: string): void {
    const state = this.guildStates.get(guildId);
    if (!state) {
      return;
    }

    try {
      if (state.connected) {
        state.socket.disconnect(`tcp://127.0.0.1:${String(state.port)}`);
      }
      state.socket.close();
    } catch (error) {
      this.logger.warn(`Error cleaning up ZMQ for guild ${guildId}:`, error);
    }

    this.availablePorts.push(state.port);
    this.guildStates.delete(guildId);
    this.logger.debug(`Cleaned up ZMQ controller for guild ${guildId}`);
  }

  private receiveWithTimeout(socket: Request): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ZMQ command timeout'));
      }, COMMAND_TIMEOUT_MS);

      socket
        .receive()
        .then((result) => {
          clearTimeout(timeout);
          const message = result[0];
          resolve(message ? message.toString() : '');
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          if (error instanceof Error) {
            reject(error);
          } else {
            reject(new Error(String(error)));
          }
        });
    });
  }

  private buildVolumeCommand(volume: number): string {
    // FFmpeg azmq filter command format: "<filter_name> <option> <value>"
    // See: https://ffmpeg.org/ffmpeg-filters.html#zmq_002c-azmq
    return `${VOLUME_FILTER_NAME} volume ${String(volume)}`;
  }
}
