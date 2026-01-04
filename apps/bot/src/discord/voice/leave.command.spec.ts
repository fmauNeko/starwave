import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicService } from '../music/music.service';
import { LeaveCommand } from './leave.command';
import { VoiceInactivityService } from './voice-inactivity.service';
import { VoiceService } from './voice.service';

function createMockInteraction(
  options: { guildId?: string | null } = {},
): ChatInputCommandInteraction {
  const { guildId = 'guild-123' } = options;

  return {
    guildId,
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

/* eslint-disable @typescript-eslint/no-deprecated */
describe('LeaveCommand', () => {
  let command: LeaveCommand;
  let voiceService: VoiceService;
  let musicService: MusicService;
  let voiceInactivityService: VoiceInactivityService;

  beforeEach(() => {
    vi.clearAllMocks();

    voiceService = {
      isConnected: vi.fn().mockReturnValue(true),
      leave: vi.fn().mockReturnValue(true),
    } as unknown as VoiceService;

    musicService = {
      cleanup: vi.fn(),
    } as unknown as MusicService;

    voiceInactivityService = {
      cancelTimer: vi.fn(),
    } as unknown as VoiceInactivityService;

    command = new LeaveCommand(
      voiceService,
      musicService,
      voiceInactivityService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('leave', () => {
    it('returns error when not in a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await command.leave([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('returns error when bot is not connected to voice', async () => {
      vi.mocked(voiceService.isConnected).mockReturnValue(false);
      const interaction = createMockInteraction();

      await command.leave([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "I'm not connected to a voice channel.",
        flags: MessageFlags.Ephemeral,
      });
    });

    it('cancels inactivity timer before leaving', async () => {
      const interaction = createMockInteraction();

      await command.leave([interaction]);

      expect(voiceInactivityService.cancelTimer).toHaveBeenCalledWith(
        'guild-123',
      );
    });

    it('cleans up music service', async () => {
      const interaction = createMockInteraction();

      await command.leave([interaction]);

      expect(musicService.cleanup).toHaveBeenCalledWith('guild-123');
    });

    it('leaves voice channel', async () => {
      const interaction = createMockInteraction();

      await command.leave([interaction]);

      expect(voiceService.leave).toHaveBeenCalledWith('guild-123');
    });

    it('replies with success message', async () => {
      const interaction = createMockInteraction();

      await command.leave([interaction]);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '👋 Left the voice channel.',
      });
    });

    it('performs cleanup in correct order', async () => {
      const callOrder: string[] = [];

      vi.mocked(voiceInactivityService.cancelTimer).mockImplementation(() => {
        callOrder.push('cancelTimer');
      });
      vi.mocked(musicService.cleanup).mockImplementation(() => {
        callOrder.push('cleanup');
      });
      vi.mocked(voiceService.leave).mockImplementation(() => {
        callOrder.push('leave');
        return true;
      });

      const interaction = createMockInteraction();
      await command.leave([interaction]);

      expect(callOrder).toEqual(['cancelTimer', 'cleanup', 'leave']);
    });
  });
});
/* eslint-enable @typescript-eslint/no-deprecated */
