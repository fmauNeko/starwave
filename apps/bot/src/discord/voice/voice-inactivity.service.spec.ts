import * as discordVoice from '@discordjs/voice';
import { TestBed, type Mocked } from '@suites/unit';
import type {
  Client,
  Collection,
  Guild,
  GuildMember,
  User,
  VoiceBasedChannel,
  VoiceState,
} from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInactivityService } from './voice-inactivity.service';
import { VoiceService } from './voice.service';

vi.mock('@discordjs/voice', () => ({
  getVoiceConnection: vi.fn(),
}));

function createMockVoiceChannel(
  options: {
    id?: string;
    memberCount?: number;
    includeBot?: boolean;
  } = {},
): VoiceBasedChannel {
  const { id = 'voice-123', memberCount = 0, includeBot = true } = options;

  const members = new Map<string, GuildMember>();

  if (includeBot) {
    members.set('bot-123', {
      user: { bot: true } as User,
    } as GuildMember);
  }

  for (let i = 0; i < memberCount; i++) {
    members.set(`user-${String(i)}`, {
      user: { bot: false } as User,
    } as GuildMember);
  }

  return {
    id,
    members: {
      filter: vi.fn((fn: (member: GuildMember) => boolean) => {
        const filtered = new Map<string, GuildMember>();
        for (const [key, member] of members) {
          if (fn(member)) {
            filtered.set(key, member);
          }
        }
        return { size: filtered.size };
      }),
    } as unknown as Collection<string, GuildMember>,
  } as unknown as VoiceBasedChannel;
}

function createMockVoiceState(
  options: {
    guildId?: string;
    channelId?: string | null;
  } = {},
): VoiceState {
  const { guildId = 'guild-123', channelId = 'voice-123' } = options;

  return {
    guild: { id: guildId } as Guild,
    channelId,
  } as VoiceState;
}

function createMockClient(
  options: {
    botChannelId?: string | null;
  } = {},
): Client<true> {
  const { botChannelId = 'voice-123' } = options;

  const botVoiceChannel = botChannelId
    ? createMockVoiceChannel({ id: botChannelId })
    : null;

  return {
    guilds: {
      cache: {
        get: vi.fn().mockReturnValue({
          members: {
            me: {
              voice: {
                channel: botVoiceChannel,
              },
            },
          },
        } as unknown as Guild),
      },
    },
  } as unknown as Client<true>;
}

/* eslint-disable @typescript-eslint/dot-notation */
describe('VoiceInactivityService', () => {
  let service: VoiceInactivityService;
  let voiceService: Mocked<VoiceService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const { unit, unitRef } = await TestBed.solitary(
      VoiceInactivityService,
    ).compile();

    service = unit;
    voiceService = unitRef.get(VoiceService);

    vi.mocked(voiceService.isConnected).mockReturnValue(true);
    vi.mocked(voiceService.leave).mockReturnValue(true);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('onClientReady', () => {
    it('stores client reference', () => {
      const mockClient = createMockClient();

      service.onClientReady([mockClient]);

      expect(service['client']).toBe(mockClient);
    });
  });

  describe('onVoiceStateUpdate', () => {
    it('ignores events when bot is not connected', () => {
      vi.mocked(voiceService.isConnected).mockReturnValue(false);
      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(voiceService.leave).not.toHaveBeenCalled();
    });

    it('ignores events when client is not ready', () => {
      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );
      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(voiceService.leave).not.toHaveBeenCalled();
    });

    it('schedules leave when last user leaves the channel', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(true);
    });

    it('does not schedule leave when other users remain in channel', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const channelWithUsers = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 1,
      });
      const guild = {
        members: {
          me: { voice: { channel: channelWithUsers } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);
    });

    it('cancels scheduled leave when user joins the channel', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const leaveOldState = createMockVoiceState({ channelId: 'voice-123' });
      const leaveNewState = createMockVoiceState({ channelId: null });
      service.onVoiceStateUpdate([leaveOldState, leaveNewState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(true);

      const joinOldState = createMockVoiceState({ channelId: null });
      const joinNewState = createMockVoiceState({ channelId: 'voice-123' });
      service.onVoiceStateUpdate([joinOldState, joinNewState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);
    });

    it('leaves after 30 seconds of inactivity', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(voiceService.leave).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30_000);

      expect(voiceService.leave).toHaveBeenCalledWith('guild-123');
    });

    it('does not leave if channel is no longer empty when timer fires', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      const channelWithUsers = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 1,
      });
      const guildWithUsers = {
        members: {
          me: { voice: { channel: channelWithUsers } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guildWithUsers);

      vi.advanceTimersByTime(30_000);

      expect(voiceService.leave).not.toHaveBeenCalled();
    });

    it('does not duplicate timers for same guild', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);
      service.onVoiceStateUpdate([oldState, newState]);

      vi.advanceTimersByTime(30_000);

      expect(voiceService.leave).toHaveBeenCalledTimes(1);
    });

    it('ignores events for different channel than bot is in', () => {
      const mockClient = createMockClient({ botChannelId: 'voice-123' });
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const oldState = createMockVoiceState({ channelId: 'other-voice-456' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);
    });
  });

  describe('cancelTimer', () => {
    it('cancels scheduled leave timer', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);
      expect(service['inactivityTimers'].has('guild-123')).toBe(true);

      service.cancelTimer('guild-123');

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);

      vi.advanceTimersByTime(30_000);
      expect(voiceService.leave).not.toHaveBeenCalled();
    });

    it('handles cancelling non-existent timer', () => {
      expect(() => {
        service.cancelTimer('non-existent');
      }).not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('clears all timers', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const emptyChannel = createMockVoiceChannel({
        id: 'voice-123',
        memberCount: 0,
      });
      const guild = {
        members: {
          me: { voice: { channel: emptyChannel } },
        },
      } as unknown as Guild;
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(guild);

      const oldState1 = createMockVoiceState({
        guildId: 'guild-1',
        channelId: 'voice-123',
      });
      const newState1 = createMockVoiceState({
        guildId: 'guild-1',
        channelId: null,
      });
      service.onVoiceStateUpdate([oldState1, newState1]);

      expect(service['inactivityTimers'].size).toBeGreaterThan(0);

      service.onModuleDestroy();

      expect(service['inactivityTimers'].size).toBe(0);
    });
  });

  describe('getBotVoiceChannel edge cases', () => {
    it('returns undefined when guild is not found', () => {
      const mockClient = {
        guilds: {
          cache: {
            get: vi.fn().mockReturnValue(undefined),
          },
        },
      } as unknown as Client<true>;
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);
    });

    it('returns undefined when bot member has no voice channel', () => {
      const mockClient = {
        guilds: {
          cache: {
            get: vi.fn().mockReturnValue({
              members: {
                me: {
                  voice: {
                    channel: null,
                  },
                },
              },
            } as unknown as Guild),
          },
        },
      } as unknown as Client<true>;
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(
        {} as discordVoice.VoiceConnection,
      );

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);
    });

    it('returns undefined when no voice connection exists', () => {
      const mockClient = createMockClient();
      service.onClientReady([mockClient]);

      vi.mocked(discordVoice.getVoiceConnection).mockReturnValue(undefined);

      const oldState = createMockVoiceState({ channelId: 'voice-123' });
      const newState = createMockVoiceState({ channelId: null });

      service.onVoiceStateUpdate([oldState, newState]);

      expect(service['inactivityTimers'].has('guild-123')).toBe(false);
    });
  });
});
