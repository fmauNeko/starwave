import { Injectable } from '@nestjs/common';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';
import { RequireRole } from '../authorization/require-role.decorator';
import { Role } from '../authorization/role.enum';

@Injectable()
@RequireRole(Role.Admin)
export class PingCommand {
  @SlashCommand({
    name: 'ping',
    description: 'ping',
  })
  public ping(@Context() [interaction]: SlashCommandContext) {
    return interaction.reply({ content: 'Pong!' });
  }
}
