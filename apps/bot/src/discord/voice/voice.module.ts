import { Module } from '@nestjs/common';
import { VoiceInactivityService } from './voice-inactivity.service';
import { VoiceService } from './voice.service';

@Module({
  providers: [VoiceService, VoiceInactivityService],
  exports: [VoiceService, VoiceInactivityService],
})
export class VoiceModule {}
