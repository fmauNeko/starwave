import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { VoiceModule } from '../voice/voice.module';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { NowPlayingComponents } from './now-playing.components';
import { NowPlayingService } from './now-playing.service';
import { BandcampProvider } from './providers/bandcamp.provider';
import { DailymotionProvider } from './providers/dailymotion.provider';
import { MusicProviderDiscovery } from './providers/music-provider-discovery.service';
import { SoundCloudProvider } from './providers/soundcloud.provider';
import { SpotifyProvider } from './providers/spotify.provider';
import { VimeoProvider } from './providers/vimeo.provider';
import { YouTubeProvider } from './providers/youtube.provider';
import { YtDlpService } from './yt-dlp.service';

@Module({
  imports: [ConfigModule, VoiceModule, DiscoveryModule],
  providers: [
    YtDlpService,
    YouTubeProvider,
    SoundCloudProvider,
    BandcampProvider,
    VimeoProvider,
    DailymotionProvider,
    SpotifyProvider,
    MusicProviderDiscovery,
    MusicService,
    NowPlayingService,
    NowPlayingComponents,
    MusicCommands,
  ],
  exports: [MusicService, NowPlayingService],
})
export class MusicModule {}
