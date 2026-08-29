import "./config";

import express, { type Request, Response, NextFunction } from "express";
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from 'path';
import net from 'net';
import { randomUUID } from 'crypto';
import type { Server as HttpServer } from 'http';
import type { WebSocketServer } from 'ws';
import { storage } from "./storage";
import { pool } from "./db";
import { csrfProtection } from "./csrf";
import { logger, LogContext } from "./logger";
import { setupAuth } from "./auth";
import { runMigrations } from "./migrate";

const SHUTDOWN_TIMEOUT_MS = 30_000;
let isShuttingDown = false;

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false, limit: '20mb' }));

const basicUser = process.env.BASIC_AUTH_USER;
const basicPass = process.env.BASIC_AUTH_PASS;
const basicRealm = process.env.BASIC_AUTH_REALM || 'Protected';

if (basicUser && basicPass) {
  const safeEqual = (a: string, b: string) => {
    const len = Math.max(a.length, b.length);
    let res = 0;
    for (let i = 0; i < len; i++) {
      const ca = a.charCodeAt(i) || 0;
      const cb = b.charCodeAt(i) || 0;
      res |= (ca ^ cb);
    }
    return res === 0 && a.length === b.length;
  };

  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();

    const hdr = req.headers.authorization || '';
    const m = /^Basic\s+(.+)$/i.exec(hdr);
    if (!m) {
      res.setHeader('WWW-Authenticate', `Basic realm="${basicRealm}", charset="UTF-8"`);
      return res.status(401).end('Authorization required');
    }
    let user = '';
    let pass = '';
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      user = decoded.slice(0, idx);
      pass = decoded.slice(idx + 1);
    } catch {
    }

    if (safeEqual(user, basicUser) && safeEqual(pass, basicPass)) return next();
    res.setHeader('WWW-Authenticate', `Basic realm="${basicRealm}", charset="UTF-8"`);
    return res.status(401).end('Invalid credentials');
  });
}

app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

app.use((req, res, next) => {
  const incomingId = (req.headers['x-request-id'] as string) || (req.headers['x-correlation-id'] as string);
  const requestId = incomingId || randomUUID();
  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;
  next();
});

const isProduction = app.get("env") === "production";
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

const rateLimitDisabled = process.env.RATE_LIMIT_DISABLED === '1';
if (!rateLimitDisabled) {
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });
  app.use('/api/', apiLimiter);

  const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
  app.use(['/api/login', '/api/register', '/api/register-with-invite', '/api/invite/register'], authLimiter);

  const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
  app.use([
    '/api/upload/avatar',
    '/api/upload/memory-image',
    '/api/upload/memory-video',
    '/api/upload/document',
    '/api/upload/audio',
    '/api/upload/audio-cover',
  ], uploadLimiter);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
  const rid = res.locals.requestId;
  let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms${rid ? ` [id:${rid}]` : ''}`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// CSRF применяется до setupAuth: иначе auth-роуты (login/register/logout)
// регистрировались бы раньше защиты и оставались открытыми для CSRF-атак.
// Токен живёт вне сессии (cookie + заголовок), поэтому защита работает и для
// анонимных запросов на вход/регистрацию.
app.use(csrfProtection);
setupAuth(app);

// Клиенту никогда не отдаём внутреннее сообщение ошибки: err.message может
// содержать детали БД, файловые пути, фрагменты SQL и прочую внутреннюю
// информацию. Возвращаем только безопасный обобщённый текст, выбранный по
// HTTP-статусу (коды согласованы с ERROR_CODES в routes.ts), плюс requestId
// для корреляции с серверными логами, где записана настоящая ошибка.
function clientSafeError(status: number): { error: string; message: string } {
  switch (status) {
    case 400:
      return { error: 'bad_request', message: 'Некорректный запрос' };
    case 401:
      return { error: 'unauthorized', message: 'Требуется авторизация' };
    case 403:
      return { error: 'forbidden', message: 'Доступ запрещён' };
    case 404:
      return { error: 'not_found', message: 'Не найдено' };
    case 413:
      return { error: 'file_too_large', message: 'Слишком большой запрос' };
    case 415:
      return { error: 'unsupported_media_type', message: 'Неподдерживаемый тип данных' };
    case 429:
      return { error: 'rate_limit_exceeded', message: 'Слишком много запросов' };
    default:
      return status < 500
        ? { error: 'bad_request', message: 'Некорректный запрос' }
        : { error: 'internal_error', message: 'Внутренняя ошибка сервера' };
  }
}

(async () => {
  // Схему БД накатываем до открытия порта: на Render (Docker) отдельного шага
  // db:push нет, иначе таблиц не существует и все запросы к БД падают с 500.
  await runMigrations();

  const server = await registerRoutes(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const errObj = err as { status?: number; statusCode?: number } | null | undefined;
    const rawStatus = Number(errObj?.status ?? errObj?.statusCode);
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

    const rid = res.locals.requestId || res.getHeader('x-request-id') || randomUUID();
    logger.error(LogContext.SERVER, `Unhandled request error [${_req.method} ${_req.path}]`, err);

    // Если ответ уже отправлен (например, ошибка после начала стрима),
    // не пытаемся повторно установить заголовки/отправить JSON — это вызовет ERR_HTTP_HEADERS_SENT.
    if (res.headersSent) {
      return _next(err);
    }

    const { error, message } = clientSafeError(status);
    res.setHeader('x-request-id', String(rid));
    res.status(status).json({ error, message, requestId: String(rid) });
  });

  if (app.get("env") === "development" || app.get("env") === "test") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const envPort = process.env.PORT;
  const defaultPort = 5000;
  let port = parseInt(envPort || String(defaultPort), 10);
  const isDev = app.get("env") === "development" || app.get("env") === "test";
  const hostBind = isDev ? "127.0.0.1" : "0.0.0.0";

  async function getAvailablePort(startPort: number, host: string): Promise<number> {
    return await new Promise((resolve) => {
      const tester = net
        .createServer()
        .once('error', (err: NodeJS.ErrnoException) => {
          if (err && err.code === 'EADDRINUSE') {
            resolve(getAvailablePort(startPort + 1, host));
          } else {
            resolve(startPort);
          }
        })
        .once('listening', () => {
          tester.close(() => resolve(startPort));
        })
        .listen(startPort, host);
    });
  }

  if (isDev && !envPort) {
    port = await getAvailablePort(port, hostBind);
    if (port !== defaultPort) {
      log(`port ${defaultPort} is in use, switched to ${port}`);
    }
  }
  const listenOptions: net.ListenOptions & { reusePort?: boolean } = {
    port,
    host: hostBind,
  };
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
    log(`open: http://${hostBind}:${port}`);
  });

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      log(`Already shutting down, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;
    log(`Received ${signal}, starting graceful shutdown...`);

    const forceExitTimeout = setTimeout(() => {
      log('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // Порядок важен: httpServer.close() не завершится, пока живы WS-сокеты
      // (они держат HTTP-соединения открытыми). Поэтому сначала закрываем
      // WebSocket-клиентов, потом останавливаем HTTP-сервер.
      log('Closing WebSocket connections...');
      const wss = (server as HttpServer & { wss?: WebSocketServer }).wss;
      if (wss) {
        let wsClosedCount = 0;
        wss.clients.forEach((ws) => {
          try {
            ws.close(1001, 'Server shutting down');
            wsClosedCount++;
          } catch {
            // ignore
          }
        });
        log(`Sent close to ${wsClosedCount} WebSocket connection(s)`);
      }

      log('Closing HTTP server (no new connections)...');
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      log('HTTP server closed');

      log('Closing database connections...');
      const sessionStore = storage.sessionStore as { stop?: () => void; end?: (cb: () => void) => void };
      if (sessionStore) {
        await new Promise<void>((resolve) => {
          if (sessionStore.stop) sessionStore.stop();
          else if (sessionStore.end) sessionStore.end(() => resolve());
          else resolve();
        });
        log('Session store closed');
      }

      if (pool) {
        await pool.end().catch(() => {});
        log('Database pool closed');
      }

      clearTimeout(forceExitTimeout);
      log('Graceful shutdown completed');
      process.exit(0);
    } catch (err) {
      log(`Error during shutdown: ${err}`);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error(LogContext.SERVER, 'Uncaught exception', err);
    void gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(LogContext.SERVER, 'Unhandled rejection', reason);
  });
})();
