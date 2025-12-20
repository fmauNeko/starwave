import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContainerBuilder,
  Interaction,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { Config } from '../../config/config.type';
import { DiscordForbiddenException } from './discord-forbidden.exception';

@Catch(DiscordForbiddenException)
export class DiscordForbiddenFilter implements ExceptionFilter {
  private readonly guildsSettings: Config['discord']['guildsSettings'];

  constructor(private readonly configService: ConfigService<Config, true>) {
    this.guildsSettings = this.configService.get('discord.guildsSettings', {
      infer: true,
    });
  }

  async catch(exception: DiscordForbiddenException, host: ArgumentsHost) {
    const interaction = host.getArgByIndex<[Interaction]>(0)[0];

    if (!interaction.isRepliable()) {
      return;
    }

    if (!interaction.member || !interaction.guildId) {
      throw new DiscordForbiddenException(
        'Cette fonctionnalité ne peut pas être utilisée en message privé car elle nécessite des rôles spécifiques.',
      );
    }

    const guildId = interaction.guildId;

    if (!(guildId in this.guildsSettings)) {
      throw new DiscordForbiddenException(
        "Cette fonctionnalité n'est pas configurée pour ce serveur.",
      );
    }

    const components = [
      new ContainerBuilder()
        .setAccentColor(
          Number(
            this.guildsSettings[guildId].theme.accentColor.replace('#', '0x'),
          ),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(exception.message),
        ),
    ];

    await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
  }
}
