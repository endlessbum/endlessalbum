import dotenv from 'dotenv';
import { logger, LogContext } from './logger';

const isTest = process.env.NODE_ENV === 'test';

if (isTest) {
  if (process.env.DATABASE_URL) delete process.env.DATABASE_URL;
  logger.info(LogContext.SERVER, 'Tests: skipping .env load; DATABASE_URL disabled');
} else {
  const result = dotenv.config({ override: false });
  const maskUrl = (url?: string) => {
    if (!url) return '❌ Missing';
    try {
      const u = new URL(url);
      const user = u.username ? (u.username.length > 2 ? u.username.slice(0, 2) + '***' : '***') : '';
      const host = u.hostname;
      const db = u.pathname?.slice(1) || '';
      return `${u.protocol}//${user}:${'***'}@${host}/${db}`;
    } catch {
      return (url ?? '').slice(0, 20) + '...';
    }
  };

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      logger.warn(LogContext.SERVER, '.env not found; using platform environment variables only');
    } else {
      logger.error(LogContext.SERVER, 'Ошибка загрузки .env', result.error);
    }
  } else {
    logger.info(LogContext.SERVER, 'Переменные окружения загружены из .env');
  }

  logger.info(LogContext.SERVER, `DATABASE_URL: ${maskUrl(process.env.DATABASE_URL)}`);
  logger.info(LogContext.SERVER, `PORT: ${process.env.PORT || 'Using default'}`);
}

// --- Ассерты против байпасов безопасности в production ---
//
// В коде есть несколько «удобных» лазеек для dev/test, которые в проде
// превращаются в дыры: отключение rate limiting (RATE_LIMIT_DISABLED=1 в
// index.ts), отключение/непроверка TLS к БД (DATABASE_SSL / DATABASE_SSL_REJECT_
// UNAUTHORIZED в db.ts), дефолтный секрет сессии и in-memory хранилище при
// отсутствии SESSION_SECRET/DATABASE_URL. Здесь мы падаем на старте (fail-fast),
// если такая лазейка активна при NODE_ENV=production, и не даём приложению
// подняться в небезопасной конфигурации. Условия срабатывания зеркалят реальную
// логику потребителей (index.ts, db.ts, auth.ts), чтобы ассерт не расходился с
// поведением.

const KNOWN_ENVS = ['development', 'test', 'production'] as const;
// Значения, при которых db.ts трактует DATABASE_SSL как «TLS выключен» (isFalsy).
const SSL_DISABLE_VALUES = ['disable', 'disabled', 'false', 'off', 'no', '0'];
const normalizeFlag = (value?: string) => (value ?? '').trim().toLowerCase();

/**
 * Список активных байпасов безопасности. Значим только при
 * NODE_ENV=production; для development/test всегда возвращает [].
 */
export function findProductionBypasses(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') {
    return [];
  }

  const bypasses: string[] = [];

  if (!env.SESSION_SECRET) {
    bypasses.push('SESSION_SECRET не задан — иначе используется небезопасный секрет по умолчанию');
  }
  if (!env.DATABASE_URL) {
    bypasses.push('DATABASE_URL не задан — прод не должен работать на in-memory хранилище');
  }
  // index.ts отключает rate limiting строго при значении '1'.
  if (env.RATE_LIMIT_DISABLED === '1') {
    bypasses.push('RATE_LIMIT_DISABLED=1 — ограничение частоты запросов выключено');
  }
  if (SSL_DISABLE_VALUES.includes(normalizeFlag(env.DATABASE_SSL))) {
    bypasses.push('DATABASE_SSL отключает TLS-соединение с базой данных');
  }
  if (normalizeFlag(env.DATABASE_SSL_REJECT_UNAUTHORIZED) === 'false') {
    bypasses.push('DATABASE_SSL_REJECT_UNAUTHORIZED=false — проверка TLS-сертификата БД отключена');
  }

  return bypasses;
}

/**
 * Fail-fast на старте: отклоняет неизвестный NODE_ENV (защита от опечаток и
 * регистра вроде "prod"/"Production", на которые остальной код реагирует как на
 * не-production) и не даёт подняться проду с активными байпасами.
 */
export function assertEnvironmentSafety(env: NodeJS.ProcessEnv = process.env): void {
  const nodeEnv = env.NODE_ENV && env.NODE_ENV.length > 0 ? env.NODE_ENV : 'development';
  if (!(KNOWN_ENVS as readonly string[]).includes(nodeEnv)) {
    throw new Error(
      `Некорректный NODE_ENV="${env.NODE_ENV}". Допустимые значения (с учётом регистра): ${KNOWN_ENVS.join(', ')}.`
    );
  }

  const bypasses = findProductionBypasses(env);
  if (bypasses.length > 0) {
    throw new Error(
      'Небезопасная конфигурация production — обнаружены активные байпасы безопасности:\n' +
        bypasses.map((item) => `  - ${item}`).join('\n') +
        '\nУстраните их либо запускайте локально с NODE_ENV=development/test.'
    );
  }
}

assertEnvironmentSafety();
if (process.env.NODE_ENV === 'production') {
  logger.info(LogContext.SERVER, 'Проверки безопасности production пройдены');
}
