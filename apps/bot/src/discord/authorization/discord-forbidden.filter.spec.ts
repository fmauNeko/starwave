import type { ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TestBed } from '@suites/unit';
import { MessageFlags } from 'discord.js';
import { DiscordForbiddenException } from './discord-forbidden.exception';
import { DiscordForbiddenFilter } from './discord-forbidden.filter';

describe('DiscordForbiddenFilter', () => {
  let service: DiscordForbiddenFilter;
  const guildsSettings = {
    testGuild: {
      language: 'fr',
      roles: {
        admin: 'admin-role',
      },
      theme: { accentColor: '#ffffff' },
    },
  };

  function createHost(interaction: unknown): ArgumentsHost {
    return {
      getArgByIndex: () => [interaction],
    } as unknown as ArgumentsHost;
  }

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(DiscordForbiddenFilter)
      .mock(ConfigService)
      .final({
        get: () => guildsSettings,
      })
      .compile();
    service = unit;
  });

  it('returns early when interaction is not repliable', async () => {
    const reply = vi.fn();
    const interaction = {
      isRepliable: () => false,
      reply,
    };

    await service.catch(
      new DiscordForbiddenException('nope'),
      createHost(interaction),
    );

    expect(reply).not.toHaveBeenCalled();
  });

  it('throws a DM error when missing guild/member', async () => {
    const interaction = {
      isRepliable: () => true,
      member: null,
      guildId: null,
      reply: vi.fn(),
    };

    await expect(
      service.catch(
        new DiscordForbiddenException('nope'),
        createHost(interaction),
      ),
    ).rejects.toThrow(
      'Cette fonctionnalité ne peut pas être utilisée en message privé car elle nécessite des rôles spécifiques.',
    );
  });

  it('throws when guild is not configured', async () => {
    const interaction = {
      isRepliable: () => true,
      member: { roles: [] },
      guildId: 'unknownGuild',
      reply: vi.fn(),
    };

    await expect(
      service.catch(
        new DiscordForbiddenException('nope'),
        createHost(interaction),
      ),
    ).rejects.toThrow(
      "Cette fonctionnalité n'est pas configurée pour ce serveur.",
    );
  });

  it('replies with ephemeral components when configured', async () => {
    interface ReplyPayload {
      flags: unknown;
      components: { toJSON: () => unknown }[];
    }

    const reply = vi.fn<(payload: ReplyPayload) => Promise<void>>();
    const interaction = {
      isRepliable: () => true,
      member: { roles: [] },
      guildId: 'testGuild',
      reply,
    };

    const exception = new DiscordForbiddenException('custom message');
    await service.catch(exception, createHost(interaction));

    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0][0];
    expect(payload.flags).toEqual(
      expect.arrayContaining([
        MessageFlags.IsComponentsV2,
        MessageFlags.Ephemeral,
      ]),
    );
    expect(payload.components).toHaveLength(1);

    const containerJson = payload.components[0].toJSON();
    expect(containerJson).toMatchObject({ accent_color: 0xffffff });
    expect(JSON.stringify(containerJson)).toContain('custom message');
  });
});
