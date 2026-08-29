import { describe, it, expect } from 'vitest';
import { updateProfileSchema, coupleSettingsSchema } from '@shared/schema';
import { registerSchema, inviteRegisterSchema } from '@shared/validation';

describe('updateProfileSchema (PUT /api/profile)', () => {
  it('accepts a full valid profile update', () => {
    const result = updateProfileSchema.safeParse({
      username: 'alice',
      firstName: 'Алиса',
      lastName: 'Иванова',
      email: 'alice@example.com',
      status: 'в отношениях',
    });
    expect(result.success).toBe(true);
  });

  it('rejects usernames outside the 1-50 length range', () => {
    expect(updateProfileSchema.safeParse({ username: '' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ username: 'a'.repeat(51) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ username: 'alice' }).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(updateProfileSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ email: 'alice@example.com' }).success).toBe(true);
  });

  it('accepts http(s) and /uploads/ profile image urls but rejects other schemes', () => {
    expect(updateProfileSchema.safeParse({ profileImageUrl: 'https://cdn/x.png' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ profileImageUrl: '/uploads/avatar.png' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ profileImageUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('validates wishlist links', () => {
    const ok = updateProfileSchema.safeParse({
      wishlist: [{ title: 'Книга', link: 'https://ozon.ru/p/1' }],
    });
    expect(ok.success).toBe(true);
    const bad = updateProfileSchema.safeParse({ wishlist: [{ title: 'Книга', link: 'not-a-url' }] });
    expect(bad.success).toBe(false);
  });

  it('requires at least one field to be present', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
});

describe('coupleSettingsSchema (PUT /api/settings)', () => {
  it('accepts theme, language and relationshipStartDate', () => {
    expect(
      coupleSettingsSchema.safeParse({ theme: 'dark', language: 'ru', relationshipStartDate: '2020-01-01' }).success
    ).toBe(true);
  });

  it('accepts notifications and privacy flag groups', () => {
    expect(
      coupleSettingsSchema.safeParse({
        notifications: { emailNotifications: true, pushNotifications: false, soundNotifications: true },
      }).success
    ).toBe(true);
    expect(
      coupleSettingsSchema.safeParse({
        privacy: { guestCanViewMemories: true, guestCanComment: false, guestCanPlayGames: true },
      }).success
    ).toBe(true);
  });

  it('is fully partial — an empty object is allowed', () => {
    expect(coupleSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown theme value', () => {
    expect(coupleSettingsSchema.safeParse({ theme: 'neon' }).success).toBe(false);
  });
});

describe('registerSchema / inviteRegisterSchema', () => {
  it('accepts valid registration credentials', () => {
    expect(
      registerSchema.safeParse({ email: 'alice@example.com', username: 'alice', password: 'secret1' }).success
    ).toBe(true);
  });

  it('trims email and username, and enforces lengths', () => {
    const trimmed = registerSchema.safeParse({ email: '  a@b.ru  ', username: '  al  ', password: 'secret1' });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) {
      expect(trimmed.data.email).toBe('a@b.ru');
      expect(trimmed.data.username).toBe('al');
    }
    expect(registerSchema.safeParse({ email: 'a@b.ru', username: 'a', password: 'secret1' }).success).toBe(false);
  });

  it('rejects a short password and a malformed email', () => {
    expect(registerSchema.safeParse({ email: 'a@b.ru', username: 'alice', password: '12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'nope', username: 'alice', password: 'secret1' }).success).toBe(false);
  });

  it('inviteRegisterSchema additionally requires an invite code', () => {
    const base = { email: 'bob@example.com', username: 'bob', password: 'secret1' };
    expect(inviteRegisterSchema.safeParse(base).success).toBe(false);
    expect(inviteRegisterSchema.safeParse({ ...base, inviteCode: 'ABC-123' }).success).toBe(true);
  });
});
