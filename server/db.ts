import "./config";

import fs from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { logger, LogContext } from "./logger";

const { Pool } = pg;
let pool: pg.Pool | undefined;
let db: NodePgDatabase<typeof schema>;
const env = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL;
const canUseInMemoryStorage = env === 'development' || env === 'test';

const isFalsy = (value: string | undefined) =>
  ['disable', 'disabled', 'false', 'off', 'no', '0'].includes((value ?? '').trim().toLowerCase());

/**
 * Build the TLS configuration for the PostgreSQL pool.
 *
 * Secure by default: the server certificate is verified (`rejectUnauthorized: true`),
 * which protects the connection against man-in-the-middle attacks. Managed providers
 * (Render, Supabase, RDS, …) that present a certificate signed by a private CA must
 * supply that CA via `DATABASE_CA_CERT` (inline PEM) or `DATABASE_CA_CERT_FILE`
 * (path to a PEM file).
 *
 * Escape hatches (use sparingly, they weaken security):
 *   - `DATABASE_SSL=disable|false|off|0` — connect without TLS (trusted/private network only).
 *   - `DATABASE_SSL_REJECT_UNAUTHORIZED=false` — keep TLS but skip verification (INSECURE).
 */
function buildSslConfig(): boolean | ConnectionOptions {
  if (isFalsy(process.env.DATABASE_SSL)) {
    logger.warn(
      LogContext.DB,
      'TLS is disabled for the database connection (DATABASE_SSL). Only use this on a trusted/private network.'
    );
    return false;
  }

  const ssl: ConnectionOptions = { rejectUnauthorized: true };

  const caInline = process.env.DATABASE_CA_CERT?.trim();
  const caFile = process.env.DATABASE_CA_CERT_FILE?.trim();
  if (caInline) {
    // Allow a PEM pasted into a single-line env var with escaped newlines.
    ssl.ca = caInline.includes('\\n') ? caInline.replace(/\\n/g, '\n') : caInline;
  } else if (caFile) {
    try {
      ssl.ca = fs.readFileSync(caFile, 'utf8');
      logger.info(LogContext.DB, `Loaded database CA certificate from ${caFile}`);
    } catch (err) {
      throw new Error(
        `Failed to read DATABASE_CA_CERT_FILE ("${caFile}"): ${(err as Error).message}`
      );
    }
  }

  if ((process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? '').trim().toLowerCase() === 'false') {
    ssl.rejectUnauthorized = false;
    logger.warn(
      LogContext.DB,
      'TLS certificate verification is DISABLED (DATABASE_SSL_REJECT_UNAUTHORIZED=false). ' +
        'The connection is vulnerable to MITM attacks; provide a CA via DATABASE_CA_CERT instead.'
    );
  }

  return ssl;
}

if (databaseUrl) {
  logger.info(LogContext.DB, 'Creating PostgreSQL connection pool');
  pool = new Pool({ connectionString: databaseUrl, ssl: buildSslConfig() });
  db = drizzle({ client: pool, schema });
  logger.info(LogContext.DB, 'PostgreSQL connection pool created');
} else {
  if (!canUseInMemoryStorage) {
    throw new Error('DATABASE_URL environment variable is required outside development/test');
  }

  logger.warn(
    LogContext.DB,
    `DATABASE_URL is not set (NODE_ENV=${env}). Falling back to in-memory storage where applicable.`
  );
  pool = undefined;
  // db не используется в mem-режиме (storage.ts выбирает MemStorage), но экспорт
  // типизирован как обязательный, чтобы PgStorage не делал проверок на каждом шаге.
  db = undefined as unknown as NodePgDatabase<typeof schema>;
}

export { pool, db };
