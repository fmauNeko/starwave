import { TestBed } from '@suites/unit';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ZmqVolumeController } from './zmq-volume-controller.service';

interface MockSocket {
  connect: Mock;
  disconnect: Mock;
  close: Mock;
  send: Mock;
  receive: Mock;
}

const { MockRequest, getMockSocket } = vi.hoisted(() => {
  let instance: MockSocket | null = null;

  class MockRequest {
    connect = vi.fn();
    disconnect = vi.fn();
    close = vi.fn();
    send = vi.fn();
    receive = vi.fn();

    constructor() {
      instance = this as unknown as MockSocket;
    }
  }

  const getMockSocket = (): MockSocket => {
    if (!instance) throw new Error('MockRequest not instantiated');
    return instance;
  };

  return { MockRequest, getMockSocket };
});

vi.mock('zeromq', () => ({
  Request: MockRequest,
}));

describe('ZmqVolumeController', () => {
  let service: ZmqVolumeController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { unit } = await TestBed.solitary(ZmqVolumeController).compile();
    service = unit;
  });

  describe('allocatePort', () => {
    it('allocates sequential ports starting from 5555', () => {
      const port1 = service.allocatePort('guild1');
      const port2 = service.allocatePort('guild2');

      expect(port1).toBe(5555);
      expect(port2).toBe(5556);
    });

    it('returns existing port for same guild', () => {
      const port1 = service.allocatePort('guild1');
      const port2 = service.allocatePort('guild1');

      expect(port1).toBe(port2);
    });
  });

  describe('getBindAddress', () => {
    it('returns tcp bind address for allocated guild', () => {
      service.allocatePort('guild1');

      const address = service.getBindAddress('guild1');

      expect(address).toBe('tcp://*:5555');
    });

    it('throws for unallocated guild', () => {
      expect(() => service.getBindAddress('unknown')).toThrow(
        'No port allocated for guild unknown',
      );
    });
  });

  describe('connect', () => {
    it('connects socket to localhost address', () => {
      service.allocatePort('guild1');

      service.connect('guild1');

      expect(getMockSocket().connect).toHaveBeenCalledWith(
        'tcp://127.0.0.1:5555',
      );
    });

    it('throws for unallocated guild', () => {
      expect(() => {
        service.connect('unknown');
      }).toThrow('No port allocated for guild unknown');
    });

    it('does not reconnect if already connected', () => {
      service.allocatePort('guild1');

      service.connect('guild1');
      service.connect('guild1');

      expect(getMockSocket().connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('setVolume', () => {
    beforeEach(() => {
      service.allocatePort('guild1');
      service.connect('guild1');
    });

    it('sends volume command via ZMQ', async () => {
      getMockSocket().receive.mockResolvedValue([Buffer.from('0')]);

      await service.setVolume('guild1', 0.5);

      expect(getMockSocket().send).toHaveBeenCalledWith(
        'volume@vol volume 0.5',
      );
    });

    it('clamps volume to 0-2 range', async () => {
      getMockSocket().receive.mockResolvedValue([Buffer.from('0')]);

      const result = await service.setVolume('guild1', 3);

      expect(result).toBe(2);
      expect(getMockSocket().send).toHaveBeenCalledWith('volume@vol volume 2');
    });

    it('clamps negative volume to 0', async () => {
      getMockSocket().receive.mockResolvedValue([Buffer.from('0')]);

      const result = await service.setVolume('guild1', -1);

      expect(result).toBe(0);
    });

    it('throws on FFmpeg error response', async () => {
      getMockSocket().receive.mockResolvedValue([
        Buffer.from('-1 Invalid command'),
      ]);

      await expect(service.setVolume('guild1', 0.5)).rejects.toThrow(
        'FFmpeg error: -1 Invalid command',
      );
    });

    it('throws for disconnected guild', async () => {
      service.allocatePort('guild2');

      await expect(service.setVolume('guild2', 0.5)).rejects.toThrow(
        'ZMQ not connected for guild guild2',
      );
    });

    it('throws for unallocated guild', async () => {
      await expect(service.setVolume('unknown', 0.5)).rejects.toThrow(
        'No volume controller for guild unknown',
      );
    });
  });

  describe('getVolume', () => {
    it('returns default volume for new guild', () => {
      expect(service.getVolume('unknown')).toBe(0.25);
    });

    it('returns updated volume after setVolume', async () => {
      service.allocatePort('guild1');
      service.connect('guild1');
      getMockSocket().receive.mockResolvedValue([Buffer.from('0')]);

      await service.setVolume('guild1', 0.75);

      expect(service.getVolume('guild1')).toBe(0.75);
    });
  });

  describe('hasController', () => {
    it('returns false for unallocated guild', () => {
      expect(service.hasController('unknown')).toBe(false);
    });

    it('returns true for allocated guild', () => {
      service.allocatePort('guild1');

      expect(service.hasController('guild1')).toBe(true);
    });
  });

  describe('isConnected', () => {
    it('returns false for unallocated guild', () => {
      expect(service.isConnected('unknown')).toBe(false);
    });

    it('returns false for allocated but not connected guild', () => {
      service.allocatePort('guild1');

      expect(service.isConnected('guild1')).toBe(false);
    });

    it('returns true for connected guild', () => {
      service.allocatePort('guild1');
      service.connect('guild1');

      expect(service.isConnected('guild1')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('disconnects and closes socket', () => {
      service.allocatePort('guild1');
      service.connect('guild1');

      service.cleanup('guild1');

      expect(getMockSocket().disconnect).toHaveBeenCalledWith(
        'tcp://127.0.0.1:5555',
      );
      expect(getMockSocket().close).toHaveBeenCalled();
    });

    it('removes guild state', () => {
      service.allocatePort('guild1');
      service.connect('guild1');

      service.cleanup('guild1');

      expect(service.hasController('guild1')).toBe(false);
    });

    it('does nothing for unknown guild', () => {
      expect(() => {
        service.cleanup('unknown');
      }).not.toThrow();
    });

    it('returns port to available pool for reuse', () => {
      const port1 = service.allocatePort('guild1');
      service.cleanup('guild1');

      const port2 = service.allocatePort('guild2');

      expect(port2).toBe(port1);
    });
  });

  describe('onModuleDestroy', () => {
    it('cleans up all guild connections', () => {
      service.allocatePort('guild1');
      service.allocatePort('guild2');
      service.connect('guild1');
      service.connect('guild2');

      service.onModuleDestroy();

      expect(service.hasController('guild1')).toBe(false);
      expect(service.hasController('guild2')).toBe(false);
    });
  });
});
