import { describe, it, expect } from 'vitest';
import { findProductionBypasses, assertEnvironmentSafety } from '../server/config';

const env = (overrides: Record<string, string | undefined>) =>
  overrides as NodeJS.ProcessEnv;

// A production environment with every security toggle in its safe state.
const cleanProd = () =>
  env({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), DATABASE_URL: 'postgres://u:p@h/db', RATE_LIMIT_DISABLED: '0' });

describe('findProductionBypasses', () => {
  it('returns nothing for development/test even with unsafe flags set', () => {
    const unsafe = { RATE_LIMIT_DISABLED: '1', DATABASE_SSL: 'disable', DATABASE_SSL_REJECT_UNAUTHORIZED: 'false' };
    expect(findProductionBypasses(env({ NODE_ENV: 'development', ...unsafe }))).toEqual([]);
    expect(findProductionBypasses(env({ NODE_ENV: 'test', ...unsafe }))).toEqual([]);
    expect(findProductionBypasses(env({ ...unsafe }))).toEqual([]); // NODE_ENV undefined
  });

  it('returns nothing for a clean production config', () => {
    expect(findProductionBypasses(cleanProd())).toEqual([]);
  });

  it('flags a missing SESSION_SECRET in production', () => {
    const b = findProductionBypasses(env({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' }));
    expect(b.some((m) => m.includes('SESSION_SECRET'))).toBe(true);
  });

  it('flags a missing DATABASE_URL in production', () => {
    const b = findProductionBypasses(env({ NODE_ENV: 'production', SESSION_SECRET: 's' }));
    expect(b.some((m) => m.includes('DATABASE_URL'))).toBe(true);
  });

  it('flags disabled rate limiting only for the exact value "1"', () => {
    expect(findProductionBypasses({ ...cleanProd(), RATE_LIMIT_DISABLED: '1' }).some((m) => m.includes('RATE_LIMIT_DISABLED'))).toBe(true);
    // index.ts only disables on '1' — other values are NOT a bypass
    expect(findProductionBypasses({ ...cleanProd(), RATE_LIMIT_DISABLED: 'true' })).toEqual([]);
    expect(findProductionBypasses({ ...cleanProd(), RATE_LIMIT_DISABLED: '0' })).toEqual([]);
  });

  it('flags TLS being disabled via DATABASE_SSL (mirrors db.ts isFalsy)', () => {
    for (const v of ['disable', 'disabled', 'false', 'off', 'no', '0', '  DISABLE  ']) {
      expect(findProductionBypasses({ ...cleanProd(), DATABASE_SSL: v }).some((m) => m.includes('DATABASE_SSL отключает TLS'))).toBe(true);
    }
    // an enabling / unrecognized value is not a bypass
    expect(findProductionBypasses({ ...cleanProd(), DATABASE_SSL: 'require' })).toEqual([]);
  });

  it('flags disabled certificate verification (case/space-insensitive)', () => {
    for (const v of ['false', 'FALSE', ' false ']) {
      expect(findProductionBypasses({ ...cleanProd(), DATABASE_SSL_REJECT_UNAUTHORIZED: v }).some((m) => m.includes('DATABASE_SSL_REJECT_UNAUTHORIZED'))).toBe(true);
    }
    expect(findProductionBypasses({ ...cleanProd(), DATABASE_SSL_REJECT_UNAUTHORIZED: 'true' })).toEqual([]);
  });

  it('reports every active bypass at once', () => {
    const b = findProductionBypasses(env({ NODE_ENV: 'production', RATE_LIMIT_DISABLED: '1', DATABASE_SSL: 'disable' }));
    // missing SESSION_SECRET + missing DATABASE_URL + rate limit + TLS
    expect(b.length).toBe(4);
  });
});

describe('assertEnvironmentSafety', () => {
  it('does not throw for a clean production config', () => {
    expect(() => assertEnvironmentSafety(cleanProd())).not.toThrow();
  });

  it('does not throw for development / test / unset NODE_ENV', () => {
    expect(() => assertEnvironmentSafety(env({ NODE_ENV: 'development' }))).not.toThrow();
    expect(() => assertEnvironmentSafety(env({ NODE_ENV: 'test' }))).not.toThrow();
    expect(() => assertEnvironmentSafety(env({}))).not.toThrow();
  });

  it('throws on an unknown NODE_ENV (typo/casing guard)', () => {
    expect(() => assertEnvironmentSafety(env({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/);
    // wrong casing is rejected — the rest of the app compares === 'production'
    expect(() => assertEnvironmentSafety(env({ NODE_ENV: 'Production', SESSION_SECRET: 's', DATABASE_URL: 'x' }))).toThrow(/NODE_ENV/);
  });

  it('throws in production when a bypass is active', () => {
    expect(() => assertEnvironmentSafety(env({ NODE_ENV: 'production', SESSION_SECRET: 's', DATABASE_URL: 'x', RATE_LIMIT_DISABLED: '1' }))).toThrow(/байпас/);
  });
});
