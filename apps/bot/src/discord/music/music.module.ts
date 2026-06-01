import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { VoiceModule } from '../voice/voice.module';
import { InnertubeSessionService } from './youtube/innertube-session.service';
import { YouTubeStreamService } from './youtube/youtube-stream.service';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { NowPlayingComponents } from './now-playing.components';
import { NowPlayingService } from './now-playing.service';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import { YouTubeProvider } from './providers/youtube.provider';
import { YtDlpService } from './yt-dlp.service';

@Module({
  imports: [ConfigModule, VoiceModule, DiscoveryModule],
  providers: [
    YtDlpService,
    InnertubeSessionService,
    YouTubeStreamService,
    YouTubeProvider,
    MusicProviderDiscovery,
    MusicService,
    NowPlayingService,
    NowPlayingComponents,
    MusicCommands,
  ],
  exports: [MusicService, NowPlayingService],
})
export class MusicModule {}
