import { Module } from '@nestjs/common';
import { VoiceModule } from '../voice/voice.module';
import { MusicCommands } from './music.commands';
import { MusicService } from './music.service';

@Module({
  imports: [VoiceModule],
  providers: [MusicService, MusicCommands],
})
export class MusicModule {}
