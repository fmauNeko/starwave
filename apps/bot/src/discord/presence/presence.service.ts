import { Injectable, Logger } from '@nestjs/common';
import { ActivityType, Client } from 'discord.js';
import { Once } from 'necord';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  public constructor(private readonly client: Client) {}

  @Once('clientReady')
  public onReady() {
    if (!this.client.isReady()) {
      return;
    }
    this.client.user.setPresence({
      activities: [
        {
          name: 'Cruising through the stars 🌌',
          type: ActivityType.Custom,
        },
      ],
      status: 'online',
    });
  }
}
