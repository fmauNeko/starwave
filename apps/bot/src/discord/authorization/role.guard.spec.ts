import { createMock } from '@golevelup/ts-vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleGuard } from './role.guard';

describe('RoleGuard', () => {
  let service: RoleGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleGuard],
    })
      .useMocker(createMock)
      .compile();

    service = module.get<RoleGuard>(RoleGuard);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
