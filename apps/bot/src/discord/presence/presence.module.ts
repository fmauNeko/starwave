import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service.js';

@Module({
  providers: [PresenceService],
})
export class PresenceModule {}
