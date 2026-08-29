import { describe, it, expect } from 'vitest';
import { wsChatMessageSchema } from '@shared/schema';

describe('wsChatMessageSchema', () => {
  it('accepts a valid text message and strips a client-supplied senderId', () => {
    const result = wsChatMessageSchema.safeParse({
      type: 'chat_message',
      content: 'Привет',
      senderId: 'attacker-controlled-id',
      extra: 'nope',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Unknown keys (incl. senderId) are dropped — the server sets senderId itself.
      expect(result.data).not.toHaveProperty('senderId');
      expect(result.data).not.toHaveProperty('extra');
      expect(result.data.content).toBe('Привет');
      expect(result.data.isEphemeral).toBe(false);
    }
  });

  it('rejects an empty message (no content and no media)', () => {
    expect(wsChatMessageSchema.safeParse({ type: 'chat_message', content: '   ' }).success).toBe(false);
    expect(wsChatMessageSchema.safeParse({ type: 'chat_message' }).success).toBe(false);
  });

  it('rejects the wrong envelope type', () => {
    expect(wsChatMessageSchema.safeParse({ type: 'game_action', content: 'hi' }).success).toBe(false);
  });

  it('allows /uploads and https media urls but rejects unsafe schemes', () => {
    expect(
      wsChatMessageSchema.safeParse({ type: 'chat_message', mediaUrl: '/uploads/a.jpg', mediaType: 'image' }).success
    ).toBe(true);
    expect(
      wsChatMessageSchema.safeParse({ type: 'chat_message', mediaUrl: 'https://cdn.example/a.jpg', mediaType: 'image' })
        .success
    ).toBe(true);
    expect(
      wsChatMessageSchema.safeParse({ type: 'chat_message', mediaUrl: 'javascript:alert(1)' }).success
    ).toBe(false);
    expect(
      wsChatMessageSchema.safeParse({ type: 'chat_message', mediaUrl: 'ftp://evil/a.jpg' }).success
    ).toBe(false);
  });

  it('rejects an unknown mediaType', () => {
    expect(
      wsChatMessageSchema.safeParse({ type: 'chat_message', mediaUrl: '/uploads/a.bin', mediaType: 'exe' }).success
    ).toBe(false);
  });
});
