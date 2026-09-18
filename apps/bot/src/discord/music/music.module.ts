import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { VoiceModule } from '../voice/voice.module.js';
import { InnertubeSessionService } from './youtube/innertube-session.service.js';
import { YouTubeStreamService } from './youtube/youtube-stream.service.js';
import { MusicCommands } from './music.commands.js';
import { MusicService } from './music.service.js';
import { NowPlayingComponents } from './now-playing.components.js';
import { NowPlayingService } from './now-playing.service.js';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service.js';
import { YouTubeProvider } from './providers/youtube.provider.js';
import { YtDlpService } from './yt-dlp.service.js';

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
