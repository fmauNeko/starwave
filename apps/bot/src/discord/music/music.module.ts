import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { VoiceModule } from '../voice/voice.module';
import { AudioFilterService } from './audio-filter.service';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import { YouTubeProvider } from './providers/youtube.provider';
import { YtDlpService } from './yt-dlp.service';
import { ZmqVolumeController } from './zmq-volume-controller.service';

@Module({
  imports: [
    ConfigModule,
    VoiceModule,
    DiscoveryModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    AudioFilterService,
    ZmqVolumeController,
    YtDlpService,
    YouTubeProvider,
    MusicProviderDiscovery,
    MusicService,
    MusicCommands,
  ],
})
export class MusicModule {}
