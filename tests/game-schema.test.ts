import { describe, it, expect } from 'vitest';
import { insertGameSchema, serverGameSchema, wsGameActionSchema } from '@shared/schema';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('insertGameSchema (storage-level)', () => {
  it('requires a uuid coupleId and a known game type', () => {
    expect(
      insertGameSchema.safeParse({ coupleId: UUID, type: 'truth_or_dare' }).success
    ).toBe(true);
    expect(insertGameSchema.safeParse({ coupleId: 'not-a-uuid', type: 'truth_or_dare' }).success).toBe(false);
    expect(insertGameSchema.safeParse({ coupleId: UUID, type: 'monopoly' }).success).toBe(false);
  });

  it('accepts only declared game types', () => {
    for (const type of ['truth_or_dare', 'twenty_questions', 'partner_quiz', 'role_playing']) {
      expect(insertGameSchema.safeParse({ coupleId: UUID, type }).success, type).toBe(true);
    }
  });

  it('defaults state/isActive and allows an optional uuid currentPlayer', () => {
    const result = insertGameSchema.safeParse({ coupleId: UUID, type: 'partner_quiz' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toEqual({});
      expect(result.data.isActive).toBe(true);
      expect(result.data.currentPlayer).toBeUndefined();
    }
    expect(
      insertGameSchema.safeParse({ coupleId: UUID, type: 'partner_quiz', currentPlayer: UUID }).success
    ).toBe(true);
    expect(
      insertGameSchema.safeParse({ coupleId: UUID, type: 'partner_quiz', currentPlayer: 'x' }).success
    ).toBe(false);
  });
});

describe('serverGameSchema (POST /api/games)', () => {
  it('omits coupleId and currentPlayer from client input', () => {
    const result = serverGameSchema.safeParse({
      type: 'truth_or_dare',
      coupleId: 'attacker-couple',
      currentPlayer: 'attacker-user',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('coupleId');
      expect(result.data).not.toHaveProperty('currentPlayer');
    }
  });
});

describe('wsGameActionSchema (WS game_action)', () => {
  const valid = {
    type: 'game_action',
    gameType: 'truth_or_dare',
    gameId: UUID,
    action: 'new_action',
    data: { score: 10 },
    senderId: UUID,
  };

  it('accepts a valid action', () => {
    expect(wsGameActionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects the wrong envelope type', () => {
    expect(wsGameActionSchema.safeParse({ ...valid, type: 'chat_message' }).success).toBe(false);
  });

  it('rejects actions whose payload is larger than 10KB', () => {
    const huge = {
      ...valid,
      data: { blob: 'x'.repeat(10001) },
    };
    expect(wsGameActionSchema.safeParse(huge).success).toBe(false);
  });

  it('rejects an overlong action name and non-uuid ids', () => {
    expect(wsGameActionSchema.safeParse({ ...valid, action: 'x'.repeat(51) }).success).toBe(false);
    expect(wsGameActionSchema.safeParse({ ...valid, gameId: 'short' }).success).toBe(false);
    expect(wsGameActionSchema.safeParse({ ...valid, senderId: 'short' }).success).toBe(false);
  });
});
