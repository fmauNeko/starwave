import { ConfigService } from '@nestjs/config';
import { TestBed } from '@suites/unit';
import { Config } from '../../config/config.type';
import { Role } from './role.enum';
import { RoleGuard } from './role.guard';

describe('RoleGuard', () => {
  let service: RoleGuard;

  beforeEach(async () => {
    const guildsSettings: Config['discord']['guildsSettings'] = {
      testGuild: {
        language: 'fr',
        roles: {
          [Role.Admin]: 'admin-role',
        },
        theme: { accentColor: '#ffffff' },
      },
    };

    const { unit } = await TestBed.solitary(RoleGuard)
      .mock(ConfigService)
      .final({
        get: () => guildsSettings,
      })
      .compile();

    service = unit;
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
