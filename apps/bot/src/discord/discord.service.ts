import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'discord.js';
import { Context, type ContextOf, On, Once } from 'necord';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  public constructor(private readonly client: Client) {}

  @Once('clientReady')
  public onReady(@Context() [client]: ContextOf<'ready'>) {
    this.logger.log(`Bot logged in as ${client.user.username}`);
  }

  @On('warn')
  public onWarn(@Context() [message]: ContextOf<'warn'>) {
    this.logger.warn(message);
  }
}
