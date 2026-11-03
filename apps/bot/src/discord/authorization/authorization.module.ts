import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DiscordForbiddenFilter } from './discord-forbidden.filter.js';
import { RoleGuard } from './role.guard.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: DiscordForbiddenFilter,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AuthorizationModule {}
