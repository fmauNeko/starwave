import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GatewayIntentBits } from 'discord.js';
import { NecordModule } from 'necord';
import { Config } from '../config/config.type';
import { AuthorizationModule } from './authorization/authorization.module';
import { DiscordService } from './discord.service';
import { MusicModule } from './music/music.module';
import { PingCommand } from './ping/ping.command';
import { PresenceModule } from './presence/presence.module';
import { LeaveCommand } from './voice/leave.command';
import { VoiceModule } from './voice/voice.module';

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
