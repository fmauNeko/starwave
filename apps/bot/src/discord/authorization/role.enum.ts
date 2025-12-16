export const Role = {
  Admin: 'admin',
} as const satisfies Record<string, string>;

export type Role = (typeof Role)[keyof typeof Role];

export const RoleRank = {
  [Role.Admin]: 1,
} as const satisfies Record<Role, number>;
