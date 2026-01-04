import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { VoiceModule } from '../voice/voice.module';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import { YouTubeProvider } from './providers/youtube.provider';
import { YtDlpService } from './yt-dlp.service';

@Module({
  imports: [
    ConfigModule,
    VoiceModule,
    DiscoveryModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    YtDlpService,
    YouTubeProvider,
    MusicProviderDiscovery,
    MusicService,
    MusicCommands,
  ],
  exports: [MusicService],
})
export class MusicModule {}
