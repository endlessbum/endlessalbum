import { describe, it, expect } from 'vitest';
import { serverMessageSchema, messageStatusSchema } from '@shared/schema';

describe('serverMessageSchema (POST /api/messages)', () => {
  it('accepts a plain text message', () => {
    const result = serverMessageSchema.safeParse({ type: 'text', content: 'Привет!' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('text');
      expect(result.data.content).toBe('Привет!');
    }
  });

  it('rejects a text message without content (or with only whitespace)', () => {
    expect(serverMessageSchema.safeParse({ type: 'text' }).success).toBe(false);
    expect(serverMessageSchema.safeParse({ type: 'text', content: '   ' }).success).toBe(false);
    expect(serverMessageSchema.safeParse({ type: 'text', content: '' }).success).toBe(false);
  });

  it('accepts media messages only with a mediaUrl', () => {
    for (const type of ['image', 'video', 'document', 'ephemeral_image', 'ephemeral_video']) {
      const withUrl = serverMessageSchema.safeParse({ type, mediaUrl: '/uploads/m.jpg' });
      expect(withUrl.success, `${type} with url`).toBe(true);
      const withoutUrl = serverMessageSchema.safeParse({ type });
      expect(withoutUrl.success, `${type} without url`).toBe(false);
    }
  });

  it('accepts https:// and /uploads/ media urls but rejects other schemes', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'image', mediaUrl: 'https://cdn.example/x.jpg' }).success
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'image', mediaUrl: 'javascript:alert(1)' }).success
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({ type: 'image', mediaUrl: 'ftp://evil/x.jpg' }).success
    ).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(serverMessageSchema.safeParse({ type: 'sms', content: 'x' }).success).toBe(false);
  });

  it('strips coupleId/senderId/expiresAt supplied by a client (server sets them)', () => {
    const result = serverMessageSchema.safeParse({
      type: 'text',
      content: 'hi',
      coupleId: 'attacker-couple',
      senderId: 'attacker-user',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('coupleId');
      expect(result.data).not.toHaveProperty('senderId');
      expect(result.data).not.toHaveProperty('expiresAt');
    }
  });

  it('defaults isEphemeral to false', () => {
    const result = serverMessageSchema.safeParse({ type: 'text', content: 'hi' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isEphemeral).toBe(false);
  });
});

describe('messageStatusSchema (PUT /api/messages/:id)', () => {
  it('accepts isRead and/or reactions updates', () => {
    expect(messageStatusSchema.safeParse({ isRead: true }).success).toBe(true);
    expect(messageStatusSchema.safeParse({ reactions: { '❤️': ['u1'] } }).success).toBe(true);
    expect(messageStatusSchema.safeParse({ isRead: true, reactions: {} }).success).toBe(true);
  });

  it('rejects an empty status update (at least one field is required)', () => {
    expect(messageStatusSchema.safeParse({}).success).toBe(false);
  });
});
