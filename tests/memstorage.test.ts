import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../server/storage';

describe('MemStorage', () => {
  let s: MemStorage;
  beforeEach(() => {
    s = new MemStorage();
  });

  // Хелпер: создаёт пользователя и явно создаёт ему пару (как в auth.ts /api/register)
  async function createUserWithCouple(username: string, email: string) {
    const u = await s.createUser({ username, email, password: 'p' });
    const couple = await s.createCouple(u.id);
    return await s.updateUser(u.id, { coupleId: couple.id, role: 'main_admin' });
  }

  it('creates user and explicit couple for main_admin', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    expect(u1.role).toBe('main_admin');
    expect(u1.coupleId).toBeTruthy();
    const couple = await s.getCoupleById(u1.coupleId!);
    expect(couple?.mainAdminId).toBe(u1.id);
  });

  it('generates/revokes invite code and allows joinCouple with role assignment', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const code = await s.generateInviteCode(u1.coupleId!);
    expect(typeof code).toBe('string');
    expect(code).toMatch(/-/);

    await s.revokeInviteCode(u1.coupleId!);
    const code2 = await s.generateInviteCode(u1.coupleId!);
    expect(code2).not.toBe(code);

    const u2 = await s.createUser({ username: 'u2', email: 'u2@x', password: 'p' });
    await s.joinCouple(u2.id, code2);
    const u2Reload = await s.getUser(u2.id);
    expect(u2Reload?.coupleId).toBe(u1.coupleId);
    expect(u2Reload?.role).toBe('co_admin');
  });

  it('returns partner info for users in same couple', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const invite = await s.generateInviteCode(u1.coupleId!);
    const u2 = await s.createUser({ username: 'u2', email: 'u2@x', password: 'p' });
    await s.joinCouple(u2.id, invite);
    const partner = await s.getPartnerInfo(u1.id);
    expect(partner && partner.id).not.toBe(u1.id);
  });

  it('updates user fields safely preserving id', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const updated = await s.updateUser(u1.id, { firstName: 'Alice' });
    expect(updated.id).toBe(u1.id);
    expect(updated.firstName).toBe('Alice');
  });

  it('updates couple settings merging keys', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const c1 = await s.updateCoupleSettings(u1.coupleId!, { theme: 'dark' } as any);
    expect(c1.settings?.theme).toBe('dark');
    const c2 = await s.updateCoupleSettings(u1.coupleId!, { locale: 'ru' } as any);
    expect(c2.settings?.theme).toBe('dark');
    expect(c2.settings?.locale).toBe('ru');
  });

  it('rejects joining a second couple when already in one', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const u2 = await createUserWithCouple('u2', 'u2@x');
    const code = await s.generateInviteCode(u1.coupleId!);
    await expect(s.joinCouple(u2.id, code)).rejects.toThrow('User already in a couple');
  });

  it('rejects a third member joining a full couple', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const code = await s.generateInviteCode(u1.coupleId!);
    const u2 = await s.createUser({ username: 'u2', email: 'u2@x', password: 'p' });
    await s.joinCouple(u2.id, code);

    const u3 = await s.createUser({ username: 'u3', email: 'u3@x', password: 'p' });
    await expect(s.joinCouple(u3.id, code)).rejects.toThrow('Couple is full');
  });

  it('deleteExpiredMessages removes only expired ephemeral messages and returns them (with mediaUrl for cleanup)', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const coupleId = u1.coupleId!;
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    const expired = await s.createMessage({
      coupleId,
      senderId: u1.id,
      type: 'ephemeral_image',
      mediaUrl: '/uploads/messages/expired.jpg',
      isEphemeral: true,
      expiresAt: past,
    } as any);
    const notYet = await s.createMessage({
      coupleId,
      senderId: u1.id,
      type: 'ephemeral_image',
      isEphemeral: true,
      expiresAt: future,
    } as any);
    const plain = await s.createMessage({
      coupleId,
      senderId: u1.id,
      type: 'text',
      content: 'привет',
    } as any);

    const deleted = await s.deleteExpiredMessages();

    // Возвращает ровно просроченное эфемерное сообщение — с mediaUrl, чтобы
    // вызывающий код мог удалить файл.
    expect(deleted.map(m => m.id)).toEqual([expired.id]);
    expect(deleted[0].mediaUrl).toBe('/uploads/messages/expired.jpg');

    // Ещё не просроченное эфемерное и обычное текстовое остаются.
    const remaining = await s.getMessagesForCouple(coupleId);
    const ids = remaining.map(m => m.id);
    expect(ids).toContain(notYet.id);
    expect(ids).toContain(plain.id);
    expect(ids).not.toContain(expired.id);

    // Повторный вызов ничего не удаляет.
    expect(await s.deleteExpiredMessages()).toEqual([]);
  });

  it('getMessage returns a single message by id (undefined when missing)', async () => {
    const u1 = await createUserWithCouple('u1', 'u1@x');
    const coupleId = u1.coupleId!;

    const msg = await s.createMessage({
      coupleId,
      senderId: u1.id,
      type: 'text',
      content: 'привет',
    } as any);

    const found = await s.getMessage(msg.id);
    expect(found?.id).toBe(msg.id);
    expect(found?.coupleId).toBe(coupleId);
    expect(found?.senderId).toBe(u1.id);

    // Несуществующий id → undefined (роут трактует это как 404).
    expect(await s.getMessage('no-such-id')).toBeUndefined();
  });
});
