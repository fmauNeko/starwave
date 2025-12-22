import { Logger } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from './discord.service';

describe('DiscordService', () => {
  let service: DiscordService;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const { unit } = await TestBed.solitary(DiscordService).compile();
    service = unit;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs when client is ready', () => {
    const client = { user: { username: 'test-bot' } } as unknown as Client;
    service.onReady([client] as never);
    expect(logSpy).toHaveBeenCalledWith('Bot logged in as test-bot');
  });

  it('warns when the client emits a warning', () => {
    service.onWarn(['warning'] as never);
    expect(warnSpy).toHaveBeenCalledWith('warning');
  });
});
