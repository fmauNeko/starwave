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

const DEFAULT_ACCENT_COLOR = 0x5865f2;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function parseAccentColor(value: string): number {
  if (!HEX_COLOR_PATTERN.test(value)) {
    return DEFAULT_ACCENT_COLOR;
  }
  return Number.parseInt(value.slice(1), 16);
}

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
      await interaction.reply({
        content:
          'Cette fonctionnalité ne peut pas être utilisée en message privé car elle nécessite des rôles spécifiques.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const guildId = interaction.guildId;
    const settings = this.guildsSettings[guildId];

    if (!settings) {
      await interaction.reply({
        content: "Cette fonctionnalité n'est pas configurée pour ce serveur.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const components = [
      new ContainerBuilder()
        .setAccentColor(parseAccentColor(settings.theme.accentColor))
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
