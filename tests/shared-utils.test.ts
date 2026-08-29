import { describe, it, expect } from 'vitest';
import { sanitizeUser } from '@shared/utils';

describe('sanitizeUser', () => {
  it('removes the password field and preserves everything else', () => {
    const user = {
      id: 'u1',
      username: 'alice',
      email: 'alice@example.com',
      password: 'hunter2',
      role: 'main_admin',
      coupleId: 'c1',
    };
    const sanitized = sanitizeUser(user);
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized.username).toBe('alice');
    expect(sanitized.role).toBe('main_admin');
    expect(sanitized.coupleId).toBe('c1');
  });

  it('does not mutate the original object', () => {
    const user = { id: 'u1', password: 'x' };
    sanitizeUser(user);
    expect(user).toHaveProperty('password');
  });
});
