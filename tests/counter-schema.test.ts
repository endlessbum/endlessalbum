import { describe, it, expect } from 'vitest';
import { insertCounterSchema, serverCounterSchema } from '@shared/schema';

describe('insertCounterSchema', () => {
  it('still requires coupleId for raw inserts (storage-level schema)', () => {
    expect(insertCounterSchema.safeParse({ name: 'Test', value: 5 }).success).toBe(false);
    expect(insertCounterSchema.safeParse({ name: 'Test', value: 5, coupleId: 'c1' }).success).toBe(true);
  });
});

describe('serverCounterSchema (POST /api/counters)', () => {
  it('accepts a client payload without coupleId (server fills it from session)', () => {
    const result = serverCounterSchema.safeParse({ name: 'Дней вместе', value: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('coupleId');
      expect(result.data.name).toBe('Дней вместе');
      expect(result.data.value).toBe(5);
    }
  });

  it('coerces an <input type="date"> string into a Date', () => {
    const result = serverCounterSchema.safeParse({ name: 'Test', value: 0, targetDate: '2026-08-13' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetDate).toBeInstanceOf(Date);
      expect(result.data.targetDate?.toISOString()).toBe('2026-08-13T00:00:00.000Z');
    }
  });

  it('treats missing/empty/null targetDate as null', () => {
    expect(serverCounterSchema.safeParse({ name: 'Test', value: 1 }).success).toBe(true);
    if (serverCounterSchema.safeParse({ name: 'Test', value: 1 }).success) {
      expect(serverCounterSchema.safeParse({ name: 'Test', value: 1 }).data?.targetDate).toBeNull();
    }
    expect(serverCounterSchema.safeParse({ name: 'Test', value: 1, targetDate: '' }).data?.targetDate).toBeNull();
    expect(serverCounterSchema.safeParse({ name: 'Test', value: 1, targetDate: null }).data?.targetDate).toBeNull();
  });

  it('rejects an invalid targetDate string', () => {
    expect(serverCounterSchema.safeParse({ name: 'Test', value: 1, targetDate: 'not-a-date' }).success).toBe(false);
    expect(serverCounterSchema.safeParse({ name: 'Test', value: 1, targetDate: '2026-13-40' }).success).toBe(false);
  });

  it('rejects a payload without a name', () => {
    expect(serverCounterSchema.safeParse({ value: 5 }).success).toBe(false);
  });

  it('strips a client-supplied coupleId so the server can override it from the session', () => {
    const result = serverCounterSchema.safeParse({ name: 'Test', value: 5, coupleId: 'attacker-couple' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('coupleId');
    }
  });
});

describe('serverCounterSchema.partial() (PUT /api/counters/:id)', () => {
  it('allows updating a subset of fields', () => {
    const result = serverCounterSchema.partial().safeParse({ value: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ value: 10 });
    }
  });

  it('allows clearing targetDate and never exposes coupleId in updates', () => {
    expect(serverCounterSchema.partial().safeParse({ targetDate: null, isVisible: false }).success).toBe(true);
    const result = serverCounterSchema.partial().safeParse({ coupleId: 'other-couple' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('coupleId');
    }
  });
});
