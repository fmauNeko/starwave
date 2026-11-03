import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GatewayIntentBits } from 'discord.js';
import { NecordModule } from 'necord';
import { Config } from '../config/config.type.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { DiscordService } from './discord.service.js';
import { MusicModule } from './music/music.module.js';
import { PingCommand } from './ping/ping.command.js';
import { PresenceModule } from './presence/presence.module.js';
import { LeaveCommand } from './voice/leave.command.js';
import { VoiceModule } from './voice/voice.module.js';

@Module({
  imports: [
    ConfigModule,
    NecordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<Config, true>) => ({
        development: configService.get('discord.devGuildIds', { infer: true }),
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildVoiceStates,
        ],
        token: configService.get('discord.token', { infer: true }),
      }),
      inject: [ConfigService],
    }),
    AuthorizationModule,
    MusicModule,
    PresenceModule,
    VoiceModule,
  ],
  providers: [DiscordService, PingCommand, LeaveCommand],
})
export class DiscordModule {}
