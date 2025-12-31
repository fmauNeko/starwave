import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Interaction } from 'discord.js';
import { Observable } from 'rxjs';
import { Config } from '../../config/config.type';
import { DiscordForbiddenException } from './discord-forbidden.exception';
import { ROLE_KEY } from './require-role.decorator';
import { Role, RoleRank } from './role.enum';

@Injectable()
export class RoleGuard implements CanActivate {
  private readonly roleIdToEnum: Record<string, Map<string, Role>>;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService<Config, true>,
  ) {
    const guildsSettings = this.configService.get('discord.guildsSettings', {
      infer: true,
    });

    this.roleIdToEnum = Object.fromEntries(
      Object.entries(guildsSettings).map(([guildId, settings]) => [
        guildId,
        new Map(
          (Object.entries(settings.roles) as [Role, string][])
            .toSorted((a, b) => RoleRank[a[0]] - RoleRank[b[0]])
            .map(([role, id]) => [id, role]),
        ),
      ]),
    );
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<Role | undefined>(
      ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRole === undefined) {
      return true;
    }

    const interaction = context.getArgByIndex<[Interaction]>(0)[0];

    if (!interaction.member || !interaction.guildId) {
      throw new DiscordForbiddenException(
        'Cette fonctionnalité ne peut pas être utilisée en message privé car elle nécessite des rôles spécifiques.',
      );
    }

    const guildId = interaction.guildId;
    const roleMap = this.roleIdToEnum[guildId];

    if (!roleMap) {
      throw new DiscordForbiddenException(
        "Cette fonctionnalité n'est pas configurée pour ce serveur.",
      );
    }

    const memberRoles = interaction.member.roles;
    const userRoleIds: string[] = Array.isArray(memberRoles)
      ? memberRoles
      : memberRoles.cache.map((role) => role.id);

    const mappedRoles = userRoleIds
      .map((roleId) => roleMap.get(roleId))
      .filter((role): role is Role => role !== undefined);

    if (mappedRoles.length === 0) {
      throw new DiscordForbiddenException();
    }

    const highestUserRoleRank = Math.max(
      0,
      ...mappedRoles.map((role) => RoleRank[role]),
    );

    if (highestUserRoleRank >= RoleRank[requiredRole]) {
      return true;
    }

    throw new DiscordForbiddenException();
  }
}
