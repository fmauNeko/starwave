import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { VoiceModule } from '../voice/voice.module';
import { AudioFilterService } from './audio-filter.service';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import { YouTubeProvider } from './providers/youtube.provider';
import { ZmqVolumeController } from './zmq-volume-controller.service';

@Module({
  imports: [VoiceModule, DiscoveryModule],
  providers: [
    AudioFilterService,
    ZmqVolumeController,
    YouTubeProvider,
    MusicProviderDiscovery,
    MusicService,
    MusicCommands,
  ],
})
export class MusicModule {}
