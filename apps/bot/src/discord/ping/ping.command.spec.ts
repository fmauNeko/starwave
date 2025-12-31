import { describe, expect, it, vi } from 'vitest';
import { PingCommand } from './ping.command';

describe('PingCommand', () => {
  it('replies with Pong!', () => {
    const command = new PingCommand();

    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = { reply };

    void command.ping([interaction] as never);

    expect(reply).toHaveBeenCalledWith({ content: 'Pong!' });
  });
});
