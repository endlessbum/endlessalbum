import { describe, it, expect } from 'vitest';
import { cn, createWebSocketUrl } from '@/lib/utils';

describe('cn', () => {
  it('merges classes and trims falsy', () => {
  expect(cn('a', undefined, null as any, '', 'b')).toBe('a b');
  });
});

describe('createWebSocketUrl', () => {
  it('uses wss for https and ws for http', () => {
    (global as any).window = {
      location: { protocol: 'https:', host: 'example.com' },
    };
    expect(createWebSocketUrl('/ws')).toBe('wss://example.com/ws');

    (global as any).window = {
      location: { protocol: 'http:', host: 'localhost:3000' },
    };
    expect(createWebSocketUrl('/ws')).toBe('ws://localhost:3000/ws');
  });

  it('falls back to localhost with port if host missing', () => {
    (global as any).window = {
      location: { protocol: 'http:', host: '', port: '3000' },
    };
    expect(createWebSocketUrl('/ws')).toBe('ws://localhost:3000/ws');
  });
});
