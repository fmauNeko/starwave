import { Module } from '@nestjs/common';
import { VoiceInactivityService } from './voice-inactivity.service.js';
import { VoiceService } from './voice.service.js';

@Module({
  providers: [VoiceService, VoiceInactivityService],
  exports: [VoiceService, VoiceInactivityService],
})
export class VoiceModule {}
