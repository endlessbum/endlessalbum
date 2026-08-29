import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../server/storage';
import type { InsertMemory, InsertComment, InsertGame, InsertCounter } from '@shared/schema';

describe('MemStorage content operations', () => {
  let s: MemStorage;
  beforeEach(() => {
    s = new MemStorage();
  });

  async function createUserWithCouple(username: string, email: string) {
    const u = await s.createUser({ username, email, password: 'p' });
    const couple = await s.createCouple(u.id);
    return await s.updateUser(u.id, { coupleId: couple.id, role: 'main_admin' });
  }

  describe('memories', () => {
    it('creates and fetches a memory, listing newest first', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const coupleId = u1.coupleId!;
      const m1 = await s.createMemory({ coupleId, authorId: u1.id, type: 'text', content: 'первое' } as InsertMemory);
      const m2 = await s.createMemory({ coupleId, authorId: u1.id, type: 'text', content: 'второе' } as InsertMemory);
      // Задаём явные времена, чтобы порядок был детерминированным.
      await s.updateMemory(m1.id, { createdAt: new Date('2026-01-01T00:00:00Z') });
      await s.updateMemory(m2.id, { createdAt: new Date('2026-01-02T00:00:00Z') });

      const found = await s.getMemory(m2.id);
      expect(found?.content).toBe('второе');
      expect(found?.coupleId).toBe(coupleId);

      const list = await s.getMemoriesForCouple(coupleId);
      expect(list.map(m => m.id)).toEqual([m2.id, m1.id]);
    });

    it('updates memory fields preserving id and bumping updatedAt', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const memory = await s.createMemory({
        coupleId: u1.coupleId!,
        authorId: u1.id,
        type: 'text',
        content: 'old',
      } as InsertMemory);

      const updated = await s.updateMemory(memory.id, { content: 'new', title: 'Заголовок' });
      expect(updated.id).toBe(memory.id);
      expect(updated.content).toBe('new');
      expect(updated.title).toBe('Заголовок');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(memory.updatedAt.getTime());

      await s.deleteMemory(memory.id);
      expect(await s.getMemory(memory.id)).toBeUndefined();
    });
  });

  describe('comments', () => {
    it('creates comments and lists them in chronological order', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const memory = await s.createMemory({ coupleId: u1.coupleId!, authorId: u1.id, type: 'text', content: 'x' } as InsertMemory);

      const c1 = await s.createComment({ memoryId: memory.id, authorId: u1.id, content: 'первый' } as InsertComment);
      const c2 = await s.createComment({ memoryId: memory.id, authorId: u1.id, content: 'второй' } as InsertComment);

      const comments = await s.getCommentsForMemory(memory.id);
      expect(comments.map(c => c.id)).toEqual([c1.id, c2.id]);
      expect(comments[0].content).toBe('первый');
    });
  });

  describe('games', () => {
    it('creates, lists and updates games for a couple', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const coupleId = u1.coupleId!;
      const g1 = await s.createGame({ coupleId, type: 'truth_or_dare' } as InsertGame);
      const g2 = await s.createGame({ coupleId, type: 'partner_quiz' } as InsertGame);
      // Задаём явные времена, чтобы порядок был детерминированным.
      await s.updateGame(g1.id, { createdAt: new Date('2026-01-01T00:00:00Z') });
      await s.updateGame(g2.id, { createdAt: new Date('2026-01-02T00:00:00Z') });

      const list = await s.getGamesForCouple(coupleId);
      expect(list.map(g => g.id)).toEqual([g2.id, g1.id]); // newest first
      expect(list[0].isActive).toBe(true);

      const updated = await s.updateGame(g1.id, { state: { round: 2 }, isActive: false });
      expect(updated.state).toEqual({ round: 2 });
      expect(updated.isActive).toBe(false);
      expect(updated.id).toBe(g1.id);
    });
  });

  describe('counters', () => {
    it('creates counters with defaults, updates, and deletes them', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const coupleId = u1.coupleId!;
      const c1 = await s.createCounter({ coupleId, name: 'Дней вместе', value: 0, targetDate: null } as InsertCounter);

      expect(c1.value).toBe(0);
      expect(c1.isVisible).toBe(true);
      expect(c1.targetDate).toBeNull();

      const updated = await s.updateCounter(c1.id, { value: 42, isVisible: false });
      expect(updated.value).toBe(42);
      expect(updated.isVisible).toBe(false);

      const list = await s.getCountersForCouple(coupleId);
      expect(list.map(c => c.id)).toEqual([c1.id]);

      await s.deleteCounter(c1.id);
      expect(await s.getCountersForCouple(coupleId)).toEqual([]);
    });
  });

  describe('message pagination & counts', () => {
    it('applies limit/offset, before, and orderBy desc', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const coupleId = u1.coupleId!;
      const m1 = await s.createMessage({ coupleId, senderId: u1.id, type: 'text', content: '1' } as any);
      const m2 = await s.createMessage({ coupleId, senderId: u1.id, type: 'text', content: '2' } as any);
      const m3 = await s.createMessage({ coupleId, senderId: u1.id, type: 'text', content: '3' } as any);

      // Задаём явные времена, чтобы порядок был детерминированным.
      await s.updateMessage(m1.id, { createdAt: new Date('2026-01-01T00:00:00Z') });
      await s.updateMessage(m2.id, { createdAt: new Date('2026-01-02T00:00:00Z') });
      await s.updateMessage(m3.id, { createdAt: new Date('2026-01-03T00:00:00Z') });

      expect((await s.getMessagesForCouple(coupleId)).map(m => m.id)).toEqual([m1.id, m2.id, m3.id]);
      expect((await s.getMessagesForCouple(coupleId, { limit: 2 })).map(m => m.id)).toEqual([m1.id, m2.id]);
      expect((await s.getMessagesForCouple(coupleId, { offset: 1, limit: 1 })).map(m => m.id)).toEqual([m2.id]);
      expect((await s.getMessagesForCouple(coupleId, { orderBy: 'desc' })).map(m => m.id)).toEqual([m3.id, m2.id, m1.id]);
      expect(
        (await s.getMessagesForCouple(coupleId, { before: '2026-01-03T00:00:00Z' })).map(m => m.id)
      ).toEqual([m1.id, m2.id]);

      expect(await s.getMessagesCount(coupleId)).toBe(3);
    });
  });

  describe('getProfileStats', () => {
    it('counts memories/messages/games and derives places from location tags', async () => {
      const u1 = await createUserWithCouple('u1', 'u1@x');
      const coupleId = u1.coupleId!;

      await s.createMemory({ coupleId, authorId: u1.id, type: 'photo', tags: ['location:paris'] } as InsertMemory);
      await s.createMemory({ coupleId, authorId: u1.id, type: 'photo', tags: ['location:paris', 'location:rome'] } as InsertMemory);
      await s.createMemory({ coupleId, authorId: u1.id, type: 'text', content: 'x' } as InsertMemory);

      await s.createMessage({ coupleId, senderId: u1.id, type: 'text', content: 'привет' } as any);
      await s.createGame({ coupleId, type: 'truth_or_dare' } as InsertGame);

      const stats = await s.getProfileStats(u1.id, coupleId);
      expect(stats.memoriesCount).toBe(3);
      expect(stats.messagesCount).toBe(1);
      expect(stats.gamesCount).toBe(1);
      expect(stats.placesVisited).toBe(2); // paris + rome (deduped, case-insensitive)
      expect(stats.daysInCouple).toBe(0); // пара только что создана
    });
  });
});
