import { Module } from '@nestjs/common';
import { VoiceModule } from '../voice/voice.module';
import { AudioFilterService } from './audio-filter.service';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';
import { ZmqVolumeController } from './zmq-volume-controller.service';

@Module({
  imports: [VoiceModule],
  providers: [
    AudioFilterService,
    ZmqVolumeController,
    MusicService,
    MusicCommands,
  ],
})
export class MusicModule {}
