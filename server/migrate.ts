import "./config";

import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";
import { logger, LogContext } from "./logger";

// Применяет SQL-миграции из папки migrations/ (сгенерированы drizzle-kit generate)
// при старте приложения. На Render нет шага db:push, поэтому без этого шага схема
// БД остаётся пустой и любой запрос к БД (регистрация, вход, воспоминания) падает
// с 500. Вызывается в server/index.ts до открытия порта.
export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    logger.info(LogContext.DB, 'Migrations skipped: no DATABASE_URL');
    return;
  }

  const migrationsFolder = path.join(import.meta.dirname, "..", "migrations");
  try {
    logger.info(LogContext.DB, `Applying database migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    logger.info(LogContext.DB, 'Database migrations applied');
  } catch (error) {
    logger.error(
      LogContext.DB,
      'Database migration failed — сервер не может работать без схемы БД. ' +
        'Проверьте DATABASE_URL, доступ к БД и права пользователя (нужно право CREATE на схемы/таблицы).',
      error,
    );
    throw error;
  }
}
