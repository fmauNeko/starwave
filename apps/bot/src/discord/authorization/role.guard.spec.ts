import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { TestBed } from '@suites/unit';
import { Config } from '../../config/config.type';
import { Role } from './role.enum';
import { RoleGuard } from './role.guard';

describe('RoleGuard', () => {
  let service: RoleGuard;
  let getAllAndOverride: ReturnType<typeof vi.fn>;

  const guildsSettings = {
    testGuild: {
      language: 'fr',
      roles: {
        [Role.Admin]: 'admin-role',
        secondary: 'secondary-role',
      },
      theme: { accentColor: '#ffffff' },
    },
  } as unknown as Config['discord']['guildsSettings'];

  function createContext(interaction: unknown): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      getArgByIndex: () => [interaction],
    } as unknown as ExecutionContext;
  }

  async function createGuard(requiredRole: Role | undefined) {
    getAllAndOverride = vi.fn(() => requiredRole);
    const { unit } = await TestBed.solitary(RoleGuard)
      .mock(ConfigService)
      .final({
        get: (key: string) =>
          key === 'discord.guildsSettings' ? guildsSettings : undefined,
      })
      .mock(Reflector)
      .final({
        getAllAndOverride,
      })
      .compile();

    service = unit;
  }

  it('allows when no role is required', async () => {
    await createGuard(undefined);

    const result = service.canActivate(createContext({}));
    expect(result).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalled();
  });

  it('rejects when used in DM (no guild/member)', async () => {
    await createGuard(Role.Admin);

    expect(() =>
      service.canActivate(
        createContext({
          member: null,
          guildId: null,
        }),
      ),
    ).toThrow(
      'Cette fonctionnalité ne peut pas être utilisée en message privé car elle nécessite des rôles spécifiques.',
    );
  });

  it('rejects when guild is not configured', async () => {
    await createGuard(Role.Admin);

    expect(() =>
      service.canActivate(
        createContext({
          member: { roles: ['admin-role'] },
          guildId: 'unknownGuild',
        }),
      ),
    ).toThrow("Cette fonctionnalité n'est pas configurée pour ce serveur.");
  });

  it('rejects when user has no mapped roles', async () => {
    await createGuard(Role.Admin);

    expect(() =>
      service.canActivate(
        createContext({
          member: { roles: ['some-other-role'] },
          guildId: 'testGuild',
        }),
      ),
    ).toThrow(
      "Vous n'avez pas les permissions nécessaires pour utiliser cette fonctionnalité.",
    );
  });

  it('allows when user has required role', async () => {
    await createGuard(Role.Admin);

    const result = service.canActivate(
      createContext({
        member: { roles: ['admin-role'] },
        guildId: 'testGuild',
      }),
    );
    expect(result).toBe(true);
  });

  it('allows when member roles are provided via cache', async () => {
    await createGuard(Role.Admin);

    const result = service.canActivate(
      createContext({
        member: {
          roles: {
            cache: {
              map: (fn: (role: { id: string }) => string) => [
                fn({ id: 'admin-role' }),
              ],
            },
          },
        },
        guildId: 'testGuild',
      }),
    );
    expect(result).toBe(true);
  });

  it('rejects when required role is unknown (misconfigured decorator)', async () => {
    await createGuard('unknown-role' as unknown as Role);

    expect(() =>
      service.canActivate(
        createContext({
          member: { roles: ['admin-role'] },
          guildId: 'testGuild',
        }),
      ),
    ).toThrow(
      "Vous n'avez pas les permissions nécessaires pour utiliser cette fonctionnalité.",
    );
  });
});
