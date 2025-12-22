import { TestBed } from '@suites/unit';
import { DiscordForbiddenFilter } from './discord-forbidden.filter';

describe('DiscordForbiddenFilter', () => {
  let service: DiscordForbiddenFilter;

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(DiscordForbiddenFilter).compile();
    service = unit;
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
