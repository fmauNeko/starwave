import { TestBed } from '@suites/unit';
import { Client } from 'discord.js';
import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let service: PresenceService;
  let client: {
    isReady: () => boolean;
    user: { setPresence: ReturnType<typeof vi.fn> };
  };

  it('does nothing if client is not ready', async () => {
    const setPresence = vi.fn();
    client = {
      isReady: () => false,
      user: { setPresence },
    };

    const { unit } = await TestBed.solitary(PresenceService)
      .mock(Client)
      .final(client as unknown as Client)
      .compile();

    service = unit;
    service.onReady();
    expect(setPresence).not.toHaveBeenCalled();
  });

  it('sets presence when client is ready', async () => {
    const setPresence = vi.fn();
    client = {
      isReady: () => true,
      user: { setPresence },
    };

    const { unit } = await TestBed.solitary(PresenceService)
      .mock(Client)
      .final(client as unknown as Client)
      .compile();

    service = unit;
    service.onReady();

    expect(setPresence).toHaveBeenCalledTimes(1);
    expect(setPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'online',
        activities: [
          expect.objectContaining({
            name: 'Cruising through the stars 🌌',
          }),
        ],
      }),
    );
  });
});
