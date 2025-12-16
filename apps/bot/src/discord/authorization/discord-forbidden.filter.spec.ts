import { createMock } from '@golevelup/ts-vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscordForbiddenFilter } from './discord-forbidden.filter';

describe('DiscordForbiddenFilter', () => {
  let service: DiscordForbiddenFilter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscordForbiddenFilter],
    })
      .useMocker(createMock)
      .compile();

    service = module.get<DiscordForbiddenFilter>(DiscordForbiddenFilter);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
