import { TestBed } from '@suites/unit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { AudioFilterService } from './audio-filter.service';

const createMockChildProcess = () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const process = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  process.stdout = stdout;
  process.stderr = stderr;
  process.killed = false;
  process.kill = vi.fn(() => {
    process.killed = true;
  });
  return process;
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => createMockChildProcess()),
}));

describe('AudioFilterService', () => {
  let service: AudioFilterService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { unit } = await TestBed.solitary(AudioFilterService).compile();
    service = unit;
  });

  describe('createFilteredStream', () => {
    const testUrl = 'https://example.com/audio.webm';

    it('returns a readable stream', () => {
      const result = service.createFilteredStream(testUrl);

      expect(result).toBeInstanceOf(Readable);
    });

    it('uses default volume of 0.25 when not specified', async () => {
      const { spawn } = await import('node:child_process');

      service.createFilteredStream(testUrl);

      expect(spawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-af', 'volume@vol=volume=0.25']),
        expect.any(Object),
      );
    });

    it('uses custom volume when specified', async () => {
      const { spawn } = await import('node:child_process');

      service.createFilteredStream(testUrl, { volume: 0.5 });

      expect(spawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-af', 'volume@vol=volume=0.5']),
        expect.any(Object),
      );
    });

    it('includes azmq filter when zmqBindAddress is provided', async () => {
      const { spawn } = await import('node:child_process');

      service.createFilteredStream(testUrl, {
        volume: 0.5,
        zmqBindAddress: 'tcp://*:5555',
      });

      expect(spawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-af',
          'azmq=bind_address=tcp\\\\://*\\\\:5555,volume@vol=volume=0.5',
        ]),
        expect.any(Object),
      );
    });

    it('escapes colons in zmq bind address', async () => {
      const { spawn } = await import('node:child_process');

      service.createFilteredStream(testUrl, {
        zmqBindAddress: 'tcp://127.0.0.1:5556',
      });

      expect(spawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-af',
          'azmq=bind_address=tcp\\\\://127.0.0.1\\\\:5556,volume@vol=volume=0.25',
        ]),
        expect.any(Object),
      );
    });

    it('passes URL directly to ffmpeg input', async () => {
      const { spawn } = await import('node:child_process');

      service.createFilteredStream(testUrl);

      expect(spawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-i', testUrl]),
        expect.any(Object),
      );
    });

    it('spawns ffmpeg with reconnect flags and opus output', async () => {
      const { spawn } = await import('node:child_process');

      service.createFilteredStream(testUrl);

      expect(spawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-reconnect',
          '1',
          '-reconnect_streamed',
          '1',
          '-f',
          'opus',
          '-c:a',
          'libopus',
          '-ar',
          '48000',
          '-ac',
          '2',
          'pipe:1',
        ]),
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
      );
    });
  });
});
