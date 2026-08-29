import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { type Request, type Response, type NextFunction } from "express";
import { logger, LogContext } from "./logger";

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// CSRF реализован как подписанный double-submit токен, ВЫНЕСЕННЫЙ из сессии:
// значение живёт только в cookie (не httpOnly, sameSite=strict) и в заголовке
// X-CSRF-Token — сервер не хранит его в session. Благодаря этому:
//   1) на анонимные/ботовые/статические запросы и на /api/csrf-token сессия
//      больше НЕ заводится (не плодим пустые сессии, saveUninitialized:false
//      снова работает как задумано);
//   2) регенерация сессии в passport при req.login больше не «стирает» токен —
//      cookie и клиентский кэш переживают вход, поэтому первая мутация после
//      логина не отлетает с 403.
// Токен имеет вид `<nonce>.<sig>`, где sig = HMAC-SHA256(nonce, SESSION_SECRET).
// Подпись не даёт злоумышленнику, способному навязать cookie (например, с
// соседнего поддомена), подделать валидную пару cookie/заголовок. Проверки
// Origin/Referer и sameSite=strict сохраняются как дополнительный барьер.

// Секрет читаем лениво (на каждый вызов), а не на старте модуля: порядок
// вычисления ES-модулей и загрузка ./config не должны влиять на корректность.
// Дефолт совпадает с server/auth.ts, чтобы dev/test вели себя одинаково;
// в production SESSION_SECRET обязателен (проверяется в setupAuth).
const getSecret = () => process.env.SESSION_SECRET || "dev-secret-only-for-development";

const signNonce = (nonce: string) => createHmac("sha256", getSecret()).update(nonce).digest("hex");

const safeEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

// Генерирует свежий подписанный токен. Значение самодостаточно — сервер не
// обязан ничего запоминать, валидность проверяется по подписи.
export function createCsrfToken(): string {
  const nonce = randomBytes(32).toString("hex");
  return `${nonce}.${signNonce(nonce)}`;
}

// Проверяет формат `<nonce>.<sig>` и корректность HMAC-подписи в постоянное время.
export function verifyCsrfToken(token: string | undefined | null): boolean {
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [nonce, sig] = parts;
  if (!nonce || !sig) {
    return false;
  }

  return safeEquals(sig, signNonce(nonce));
}

const parseCookies = (cookieHeader: string | undefined) => {
  if (!cookieHeader) {
    return {} as Record<string, string>;
  }

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      return acc;
    }

    let value = rawValue.join("=");
    try {
      value = decodeURIComponent(value);
    } catch {
      // Некорректное процентное кодирование (%zz и т.п.) не должно ронять
      // запрос — используем сырое значение.
    }
    acc[rawName] = value;
    return acc;
  }, {});
};

// Возвращает валидный подписанный токен из cookie запроса, либо null.
export function readValidCookieToken(req: Request): string | null {
  const cookieToken = parseCookies(req.headers.cookie)[CSRF_COOKIE_NAME];
  return cookieToken && verifyCsrfToken(cookieToken) ? cookieToken : null;
}

function attachCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

// Выдаёт клиенту CSRF-токен (эндпоинт /api/csrf-token). Если в cookie уже лежит
// валидный токен — переиспользуем его, чтобы значение было СТАБИЛЬНЫМ между
// вкладками и перезагрузками (иначе вторая вкладка перезаписала бы cookie новым
// токеном и сломала бы double-submit в первой). Сессию не трогаем.
export function issueCsrfToken(req: Request, res: Response): string {
  const token = readValidCookieToken(req) ?? createCsrfToken();
  attachCsrfCookie(res, token);
  return token;
}

const isAllowedOrigin = (value: string | undefined, req: Request) => {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const serverHost = req.get("host") || "";

    if (url.host === serverHost) {
      return true;
    }

    return process.env.NODE_ENV === "development" && url.host.startsWith("localhost");
  } catch {
    return false;
  }
};

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  if (req.path === '/api/health') {
    return next();
  }

  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin && !isAllowedOrigin(origin, req)) {
    return res.status(403).json({ error: 'Invalid origin' });
  }

  if (!origin && referer && !isAllowedOrigin(referer, req)) {
    return res.status(403).json({ error: 'Invalid referer' });
  }

  if (!origin && !referer) {
    logger.warn(LogContext.AUTH, `CSRF blocked: ${req.method} ${req.path} - Missing origin/referer`);
    return res.status(403).json({ error: 'CSRF protection: origin or referer required' });
  }

  const headerToken = req.get(CSRF_HEADER_NAME);
  const cookieToken = parseCookies(req.headers.cookie)[CSRF_COOKIE_NAME];

  if (!headerToken || !cookieToken) {
    logger.warn(LogContext.AUTH, `CSRF blocked: ${req.method} ${req.path} - Missing CSRF token`);
    return res.status(403).json({ error: 'CSRF protection: token required' });
  }

  // Double-submit: заголовок и cookie должны совпадать, и токен должен быть
  // валидно подписан нами. Совпадение проверяем до подписи, поэтому достаточно
  // верифицировать одно из значений.
  if (!safeEquals(headerToken, cookieToken) || !verifyCsrfToken(headerToken)) {
    logger.warn(LogContext.AUTH, `CSRF blocked: ${req.method} ${req.path} - Token mismatch`);
    return res.status(403).json({ error: 'CSRF protection: invalid token' });
  }

  return next();
}
