import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  createCsrfToken,
  verifyCsrfToken,
  readValidCookieToken,
  issueCsrfToken,
} from '../server/csrf';

const reqWithCookie = (cookie?: string) => ({ headers: { cookie } }) as unknown as Request;

describe('stateless signed CSRF tokens', () => {
  describe('createCsrfToken / verifyCsrfToken', () => {
    it('creates a token that verifies and has the <nonce>.<sig> shape', () => {
      const token = createCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
      expect(verifyCsrfToken(token)).toBe(true);
    });

    it('creates distinct tokens that both verify (no server-side state)', () => {
      const a = createCsrfToken();
      const b = createCsrfToken();
      expect(a).not.toBe(b);
      expect(verifyCsrfToken(a)).toBe(true);
      expect(verifyCsrfToken(b)).toBe(true);
    });

    it('rejects missing / empty / malformed tokens', () => {
      expect(verifyCsrfToken(undefined)).toBe(false);
      expect(verifyCsrfToken(null)).toBe(false);
      expect(verifyCsrfToken('')).toBe(false);
      expect(verifyCsrfToken('no-dot-here')).toBe(false);
      expect(verifyCsrfToken('too.many.parts')).toBe(false);
      expect(verifyCsrfToken('.onlysig')).toBe(false);
      expect(verifyCsrfToken('onlynonce.')).toBe(false);
    });

    it('rejects a tampered nonce (signature no longer matches)', () => {
      const token = createCsrfToken();
      const [nonce, sig] = token.split('.');
      const tamperedNonce = (nonce[0] === '0' ? '1' : '0') + nonce.slice(1);
      expect(verifyCsrfToken(`${tamperedNonce}.${sig}`)).toBe(false);
    });

    it('rejects a tampered / forged signature', () => {
      const token = createCsrfToken();
      const [nonce, sig] = token.split('.');
      const tamperedSig = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
      expect(verifyCsrfToken(`${nonce}.${tamperedSig}`)).toBe(false);
      // An attacker-chosen signature of a different length is also rejected.
      expect(verifyCsrfToken(`${nonce}.deadbeef`)).toBe(false);
    });
  });

  describe('readValidCookieToken', () => {
    it('returns the token when the cookie holds a valid signed token', () => {
      const token = createCsrfToken();
      expect(readValidCookieToken(reqWithCookie(`csrf-token=${token}`))).toBe(token);
      // still found alongside other cookies
      expect(readValidCookieToken(reqWithCookie(`connect.sid=abc; csrf-token=${token}`))).toBe(token);
    });

    it('returns null when the cookie is absent or invalid', () => {
      expect(readValidCookieToken(reqWithCookie(undefined))).toBeNull();
      expect(readValidCookieToken(reqWithCookie('connect.sid=abc'))).toBeNull();
      expect(readValidCookieToken(reqWithCookie('csrf-token=garbage'))).toBeNull();
      const [nonce] = createCsrfToken().split('.');
      expect(readValidCookieToken(reqWithCookie(`csrf-token=${nonce}.deadbeef`))).toBeNull();
    });
  });

  describe('issueCsrfToken', () => {
    it('reuses an existing valid cookie token so the value stays stable', () => {
      const existing = createCsrfToken();
      const cookie = vi.fn();
      const res = { cookie } as unknown as Response;

      const issued = issueCsrfToken(reqWithCookie(`csrf-token=${existing}`), res);

      expect(issued).toBe(existing);
      expect(cookie).toHaveBeenCalledWith('csrf-token', existing, expect.objectContaining({ httpOnly: false }));
    });

    it('mints a fresh valid token when no valid cookie is present', () => {
      const cookie = vi.fn();
      const res = { cookie } as unknown as Response;

      const issued = issueCsrfToken(reqWithCookie(undefined), res);

      expect(verifyCsrfToken(issued)).toBe(true);
      expect(cookie).toHaveBeenCalledWith('csrf-token', issued, expect.objectContaining({ sameSite: 'strict' }));
    });
  });
});
