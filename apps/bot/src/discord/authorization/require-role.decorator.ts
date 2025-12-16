import { SetMetadata } from '@nestjs/common';
import { Role } from './role.enum';

export const ROLE_KEY = 'role';
export const RequireRole = (role: Role) => SetMetadata(ROLE_KEY, role);
