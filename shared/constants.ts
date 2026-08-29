export const EPHEMERAL_MESSAGE_TTL_MINUTES = 2;

// Как часто фоновая задача (server/routes.ts) удаляет просроченные эфемерные
// сообщения и связанные с ними файлы из public/uploads. Чистим чаще, чем TTL,
// чтобы файлы не висели дольше нужного. На тесты не влияет: routes.ts не
// импортируется юнит-тестами, а сам таймер .unref()-нут.
export const EPHEMERAL_CLEANUP_INTERVAL_MS = 60 * 1000;

export const MAX_WS_MESSAGE_SIZE = 64 * 1024;

export const HEARTBEAT_INTERVAL_MS = 30_000;

export const WS_MAX_CONNECTIONS_PER_IP = 5;

export const WS_CONNECTION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Количество доверенных обратных прокси перед приложением (на Render — один
// балансировщик). Значение общее для Express (`app.set("trust proxy", …)` в
// server/auth.ts) и для WS-лимитера (server/client-ip.ts), чтобы клиентский IP
// вычислялся ОДИНАКОВО в обоих путях. Левые записи X-Forwarded-For клиент может
// подделать — доверяем только адресу, дописанному нашим прокси. Менять только
// вместе с реальной топологией прокси.
export const TRUSTED_PROXY_HOPS = 1;

// === Лимиты размеров загружаемых файлов — ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ ===
// Эти значения импортируют И сервер (server/multer-config.ts — реальное
// применение через multer + server/routes.ts — тексты ошибок), И клиент
// (проверки перед загрузкой и подписи в UI, через formatMaxSizeMb из
// shared/utils.ts). Меняешь лимит — меняешь только здесь; сервер, клиент и все
// тексты подхватят новое значение автоматически. Значения совпадают с тем, что
// реально применял сервер (multer), чтобы клиент не обещал больше, чем примет
// бэкенд.
export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

// Изображения воспоминаний И обложки аудио (server: imageUpload/audioCoverUpload).
export const MEMORY_IMAGE_MAX_SIZE = 20 * 1024 * 1024;

export const MEMORY_VIDEO_MAX_SIZE = 100 * 1024 * 1024;

export const VOICE_MESSAGE_MAX_SIZE = 10 * 1024 * 1024;

export const AUDIO_MAX_SIZE = 50 * 1024 * 1024;

export const DOCUMENT_MAX_SIZE = 25 * 1024 * 1024;
