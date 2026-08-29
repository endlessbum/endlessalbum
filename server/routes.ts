import "./config";

import type { Express, Response } from "express";
import { createServer, type Server, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseCookie } from "cookie";
import { storage } from "./storage";
import { insertMemorySchema, insertCommentSchema, serverGameSchema, serverMessageSchema, serverCounterSchema, wsGameActionSchema, wsChatMessageSchema, updateProfileSchema, messageStatusSchema, coupleSettingsSchema, type CoupleSettings, type InsertMessage, type Message, type User } from "@shared/schema";
import type { WsIncomingMessage } from "@shared/ws-messages";
import { audioCoverUpload, audioUpload, avatarUpload, documentUpload, imageUpload, videoUpload, voiceMessageUpload } from "./multer-config";
import { isGcsConfigured, uploadToGcs } from "./gcs";
import {
  EPHEMERAL_MESSAGE_TTL_MINUTES,
  EPHEMERAL_CLEANUP_INTERVAL_MS,
  MAX_WS_MESSAGE_SIZE,
  HEARTBEAT_INTERVAL_MS,
  WS_MAX_CONNECTIONS_PER_IP,
  WS_CONNECTION_CLEANUP_INTERVAL_MS,
  AVATAR_MAX_SIZE,
  MEMORY_IMAGE_MAX_SIZE,
  MEMORY_VIDEO_MAX_SIZE,
  AUDIO_MAX_SIZE,
  VOICE_MESSAGE_MAX_SIZE,
  DOCUMENT_MAX_SIZE,
} from "@shared/constants";
import { formatMaxSizeMb } from "@shared/utils";
import { z } from "zod";
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { logger, LogContext } from './logger';
import { getClientIp } from './client-ip';

const wsConnectionCounts = new Map<string, { count: number; resetAt: number }>();

const cleanupWsConnectionCounts = () => {
  const now = Date.now();
  wsConnectionCounts.forEach((data, ip) => {
    if (now > data.resetAt) {
      wsConnectionCounts.delete(ip);
    }
  });
};

const checkWsRateLimit = (ip: string): { allowed: boolean; currentCount: number } => {
  const now = Date.now();
  const data = wsConnectionCounts.get(ip);

  if (!data || now > data.resetAt) {
    return { allowed: true, currentCount: 0 };
  }

  return { allowed: data.count < WS_MAX_CONNECTIONS_PER_IP, currentCount: data.count };
};

const incrementWsConnection = (ip: string): void => {
  const now = Date.now();
  const data = wsConnectionCounts.get(ip);

  if (!data || now > data.resetAt) {
    wsConnectionCounts.set(ip, { count: 1, resetAt: now + WS_CONNECTION_CLEANUP_INTERVAL_MS });
    return;
  }

  data.count++;
};

const decrementWsConnection = (ip: string): void => {
  const data = wsConnectionCounts.get(ip);
  if (data && data.count > 0) {
    data.count--;
  }
};

interface ApiError {
  error: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
  requestId?: string;
}

const createApiError = (
  status: number,
  error: string,
  message: string,
  details?: Array<{ field: string; message: string }>,
  requestId?: string
): { status: number; body: ApiError } => ({
  status,
  body: { error, message, ...(details && { details }), ...(requestId && { requestId }) }
});

const checkGuestAccess = async (user: Express.User, coupleId: string): Promise<{ canViewMemories: boolean; canComment: boolean; canPlayGames: boolean }> => {
  if (user.role !== 'guest') {
    return { canViewMemories: true, canComment: true, canPlayGames: true };
  }

  const couple = await storage.getCoupleById(coupleId);
  if (!couple) {
    return { canViewMemories: false, canComment: false, canPlayGames: false };
  }

  const settings = (couple.settings || {}) as CoupleSettings;
  const privacy = settings.privacy;

  return {
    canViewMemories: privacy?.guestCanViewMemories ?? false,
    canComment: privacy?.guestCanComment ?? false,
    canPlayGames: privacy?.guestCanPlayGames ?? false,
  };
};

const ERROR_CODES = {
  VALIDATION_FAILED: 'validation_failed',
  INVALID_REQUEST: 'invalid_request',
  BAD_REQUEST: 'bad_request',

  UNAUTHORIZED: 'unauthorized',
  SESSION_EXPIRED: 'session_expired',

  FORBIDDEN: 'forbidden',
  ACCESS_DENIED: 'access_denied',

  NOT_FOUND: 'not_found',
  RESOURCE_NOT_FOUND: 'resource_not_found',

  CONFLICT: 'conflict',
  ALREADY_EXISTS: 'already_exists',

  FILE_TOO_LARGE: 'file_too_large',

  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',

  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',

  INTERNAL_ERROR: 'internal_error',
  DATABASE_ERROR: 'database_error',
  UPLOAD_FAILED: 'upload_failed',
} as const;

const serverMemorySchema = insertMemorySchema.omit({
  coupleId: true,
  authorId: true,
}).extend({
  content: z.string().optional().nullable().transform(v => (v && v.trim() !== '' ? v.trim() : '')),
  mediaUrl: z.string().optional().nullable().transform(v => v && v.trim() === '' ? null : v),
  // type — строго из допустимого набора: в БД не должны попадать произвольные
  // строки (клиент поддерживает только photo/video/text/quote).
  type: z.enum(['photo', 'video', 'text', 'quote']),
}).superRefine((v, ctx) => {
  const isAbsoluteUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
  const isUploadsPath = (s?: string | null) => !!s && s.startsWith('/uploads/');

  if (v.type === 'text' || v.type === 'quote') {
    if (!v.content || v.content.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Содержимое обязательно для текста и цитаты' });
    }
  }

  if (v.type === 'photo' || v.type === 'video') {
    if (!v.mediaUrl) {
      ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'URL медиа обязателен для фото/видео' });
      return;
    }
    if (v.type === 'video' && !(isAbsoluteUrl(v.mediaUrl) || isUploadsPath(v.mediaUrl))) {
      ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'Некорректный URL видео' });
    }
    if (v.type === 'photo' && !(isAbsoluteUrl(v.mediaUrl) || isUploadsPath(v.mediaUrl))) {
      ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'Некорректный URL изображения' });
    }
  }
});

  const joinCoupleSchema = z.object({
  inviteCode: z.string().min(1, 'Код приглашения обязателен'),
});

const handleUploadError = (res: Response, err: unknown, fileTooLargeMessage: string) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large',
      message: fileTooLargeMessage,
    });
  }

  if (err instanceof Error) {
    return res.status(400).json({
      error: 'Upload error',
      message: err.message || 'Ошибка загрузки файла',
    });
  }

  return res.status(400).json({
    error: 'Upload error',
    message: 'Ошибка загрузки файла',
  });
};

const createUploadUrl = (relativePath: string) => `/uploads/${relativePath.replace(/\\/g, '/')}`;

const resolveUploadPath = (urlPath: string, uploadsBase: string): string | null => {
  if (!urlPath.startsWith('/uploads/')) {
    return null;
  }

  const rel = urlPath.replace(/^\/uploads\//, '');
  const normalized = path.normalize(path.join(uploadsBase, rel));

  if (!normalized.startsWith(uploadsBase + path.sep)) {
    return null;
  }

  return normalized;
};

// Удаляет локальный файл из public/uploads, на который ссылается медиа
// сообщения. Внешние URL (https://…) и пути вне uploads игнорируются
// (resolveUploadPath вернёт null), ошибки (файла уже нет) проглатываются —
// очистка не должна ронять запрос или фоновую задачу.
const unlinkUploadIfLocal = async (
  mediaUrl: string | null | undefined,
  uploadsBase: string,
): Promise<void> => {
  if (!mediaUrl) return;
  const normalized = resolveUploadPath(mediaUrl, uploadsBase);
  if (!normalized) return;
  try {
    await fs.unlink(normalized);
  } catch {
    // файл уже удалён или отсутствует — не критично
  }
};

// Собирает все загруженные файлы, на которые ссылается воспоминание: основное
// медиа, превью и дополнительные фото (хранятся в тегах как `image_url:<url>`).
// Обложки аудио (`audio_cover:`) намеренно НЕ включаются — они принадлежат
// музыкальной библиотеке и переиспользуются, удалять их вместе с воспоминанием
// нельзя. Используется при обновлении памяти, чтобы удалить только те файлы,
// на которые больше нет ссылок (замена/удаление медиа).
const collectMemoryUploadUrls = (memory: {
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  tags?: string[] | null;
}): string[] => {
  const urls: string[] = [];
  if (memory.mediaUrl) urls.push(memory.mediaUrl);
  if (memory.thumbnailUrl) urls.push(memory.thumbnailUrl);
  for (const tag of memory.tags ?? []) {
    if (typeof tag === 'string' && tag.startsWith('image_url:')) {
      urls.push(tag.slice('image_url:'.length));
    }
  }
  return urls;
};

// Удаляет просроченные эфемерные сообщения и связанные с ними загруженные файлы.
// Вызывается лениво из GET /api/messages и периодически из фоновой задачи,
// запускаемой в registerRoutes (таймер живёт вместе с WS-сервером, см. ниже),
// чтобы файлы не оставались сиротами после истечения TTL сообщения (#8, #13).
const purgeExpiredMessages = async (): Promise<void> => {
  const deleted = await storage.deleteExpiredMessages();
  if (deleted.length === 0) return;
  const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
  await Promise.all(deleted.map(msg => unlinkUploadIfLocal(msg.mediaUrl, uploadsBase)));
};

const writeBufferUpload = async (buffer: Buffer, originalName: string, subDir: string) => {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', subDir);
  await fs.mkdir(uploadsDir, { recursive: true });

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const ext = path.extname(originalName);
  const filename = `${uniqueSuffix}${ext}`;
  const filepath = path.join(uploadsDir, filename);

  await fs.writeFile(filepath, buffer);

  return createUploadUrl(`${subDir}/${filename}`);
};

// Загружает файл в GCS, если он настроен (GCS_BUCKET + GCS_KEYFILE). Возвращает
// публичный URL или null — тогда вызывающий код сохраняет файл локально.
// Умеет работать как с buffer (memoryStorage), так и с файлом на диске
// (diskStorage). При успешном облачном аплоуде локальный временный файл
// multer-а удаляется, чтобы не оставался сиротой в public/uploads.
const uploadToCloudOrNull = async (
  file: Express.Multer.File,
  subDir: string,
): Promise<string | null> => {
  if (!isGcsConfigured()) return null;

  const buffer = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
  if (!buffer) return null;

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const ext = path.extname(file.originalname);
  const filename = `${uniqueSuffix}${ext}`;

  const url = await uploadToGcs(buffer, `${subDir}/${filename}`, file.mimetype);

  if (file.path) {
    try {
      await fs.unlink(file.path);
    } catch {
      // временный файл уже удалён или отсутствует — не критично
    }
  }

  return url;
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Все аутентифицированные WS-подключения (используется REST-роутами для
  // мгновенной рассылки новых сообщений партнёру). Объявлен здесь, чтобы
  // замкнуть единый путь сохранение+рассылка для чата.
  const authenticatedConnections = new Map<WebSocket, { userId: string; coupleId: string; ws: WebSocket; isAlive?: boolean; clientIp?: string }>();

  // Форма исходящего WS-сообщения чата (совместима с ChatMessageIn на клиенте).
  const toChatMessagePayload = (message: Message) => ({
    type: 'chat_message',
    id: message.id,
    senderId: message.senderId,
    content: message.content ?? null,
    isEphemeral: message.isEphemeral ?? false,
    mediaUrl: message.mediaUrl ?? null,
    mediaType: message.type === 'voice' ? 'voice' : message.type === 'image' ? 'image' : message.type === 'video' ? 'video' : undefined,
    timestamp: message.createdAt instanceof Date ? message.createdAt.toISOString() : (message.createdAt ?? new Date().toISOString()),
    expiresAt: message.expiresAt instanceof Date ? message.expiresAt.toISOString() : (message.expiresAt ?? undefined),
  });

  // Рассылает сообщение всем WS-подключениям партнёра из той же пары.
  const broadcastToPartner = (connectionInfo: { coupleId: string }, message: unknown, exceptWs?: WebSocket) => {
    const payload = JSON.stringify(message);
    authenticatedConnections.forEach((connInfo, clientWs) => {
      if (clientWs !== exceptWs && connInfo.coupleId === connectionInfo.coupleId && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(payload);
      }
    });
  };

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV || "development" });
  });

  app.get("/api/version", async (_req, res) => {
    try {
      const pkgPath = path.join(process.cwd(), "package.json");
      const raw = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);
      res.json({ name: pkg.name, version: pkg.version });
    } catch {
      res.status(500).json({ error: "version_unavailable" });
    }
  });

  app.get("/api/memories", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      
      const guestAccess = await checkGuestAccess(user, user.coupleId);
      if (!guestAccess.canViewMemories) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'У вас нет доступа к воспоминаниям');
        return res.status(err.status).json(err.body);
      }
      
      const memories = await storage.getMemoriesForCouple(user.coupleId);
      res.json(memories);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching memories', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить воспоминания');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/memories", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      const validationResult = serverMemorySchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }
      
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      
      const memory = await storage.createMemory({
        ...validationResult.data,
        coupleId: user.coupleId,
        authorId: user.id,
      });
      res.json(memory);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error creating memory', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось создать воспоминание');
      res.status(err.status).json(err.body);
    }
  });

  app.put("/api/memories/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      const id = req.params.id;

      const validationResult = serverMemorySchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      const existingMemory = await storage.getMemory(id);
      if (!existingMemory) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Воспоминание не найдено');
        return res.status(err.status).json(err.body);
      }

      if (!user.coupleId || existingMemory.coupleId !== user.coupleId) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Нет доступа к этому воспоминанию');
        return res.status(err.status).json(err.body);
      }

      const updatedMemory = await storage.updateMemory(id, {
        ...validationResult.data,
        coupleId: user.coupleId,
        authorId: existingMemory.authorId,
      });

      // Удаляем старые загруженные файлы, на которые после обновления больше
      // нет ссылок (заменённое или удалённое медиа/превью/доп. фото). Сравниваем
      // по множеству URL, чтобы не удалить файл, который всё ещё используется
      // (например, превью, совпадающее с mediaUrl, или переиспользованное фото).
      const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
      const newUrls = new Set(collectMemoryUploadUrls(updatedMemory));
      const orphaned = collectMemoryUploadUrls(existingMemory).filter(u => !newUrls.has(u));
      await Promise.all(orphaned.map(u => unlinkUploadIfLocal(u, uploadsBase)));

      res.json(updatedMemory);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error updating memory', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось обновить воспоминание');
      res.status(err.status).json(err.body);
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user!;
      const id = req.params.id;
      const memory = await storage.getMemory(id);
      if (!memory) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Воспоминание не найдено');
        return res.status(err.status).json(err.body);
      }
      if (!user.coupleId || memory.coupleId !== user.coupleId) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Нет доступа к этому воспоминанию');
        return res.status(err.status).json(err.body);
      }

      // Удаляем все локальные файлы воспоминания: основное медиа, превью и
      // дополнительные фото (image_url: из тегов). Обложки аудио не трогаем —
      // collectMemoryUploadUrls их не включает (они принадлежат музыке).
      const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
      await Promise.all(
        collectMemoryUploadUrls(memory).map(u => unlinkUploadIfLocal(u, uploadsBase)),
      );

      await storage.deleteMemory(id);
      return res.json({ success: true });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error deleting memory', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось удалить воспоминание');
      return res.status(err.status).json(err.body);
    }
  });

  app.get("/api/memories/:memoryId/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      const memory = await storage.getMemory(req.params.memoryId);
      if (!memory || memory.coupleId !== user.coupleId) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Воспоминание не найдено');
        return res.status(err.status).json(err.body);
      }
      const comments = await storage.getCommentsForMemory(req.params.memoryId);
      res.json(comments);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching comments', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить комментарии');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/memories/:memoryId/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }

      const guestAccess = await checkGuestAccess(user, user.coupleId);
      if (!guestAccess.canComment) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'У вас нет прав на комментирование');
        return res.status(err.status).json(err.body);
      }

      const memory = await storage.getMemory(req.params.memoryId);
      if (!memory || memory.coupleId !== user.coupleId) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Воспоминание не найдено');
        return res.status(err.status).json(err.body);
      }

      const validationResult = insertCommentSchema.safeParse({
        memoryId: req.params.memoryId,
        authorId: user.id,
        content: req.body.content,
      });

      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации комментария',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      const comment = await storage.createComment(validationResult.data);
      res.json(comment);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error creating comment', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось создать комментарий');
      res.status(err.status).json(err.body);
    }
  });

  const MESSAGE_PAGINATION = {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 200,
  };

  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      await purgeExpiredMessages();
      
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }

      const limit = Math.min(
        Math.max(1, parseInt(req.query.limit as string) || MESSAGE_PAGINATION.DEFAULT_LIMIT),
        MESSAGE_PAGINATION.MAX_LIMIT
      );
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const before = req.query.before as string | undefined;

      const totalCount = await storage.getMessagesCount(user.coupleId);

      const messages = await storage.getMessagesForCouple(user.coupleId, {
        limit,
        offset,
        before,
        orderBy: 'desc',
      });

      res.json({
        messages,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + messages.length < totalCount,
          nextCursor: messages.length > 0 
            ? messages[messages.length - 1].createdAt 
            : null,
        }
      });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching messages', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить сообщения');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      const validationResult = serverMessageSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      
      const messageData: InsertMessage = {
        ...validationResult.data,
        coupleId: user.coupleId,
        senderId: user.id,
      };

      if (messageData.isEphemeral) {
        const expirationTime = new Date();
        expirationTime.setMinutes(expirationTime.getMinutes() + EPHEMERAL_MESSAGE_TTL_MINUTES);
        messageData.expiresAt = expirationTime;
      }
      
      const message = await storage.createMessage(messageData);
      if (user.coupleId) {
        broadcastToPartner({ coupleId: user.coupleId }, toChatMessagePayload(message));
      }
      res.json(message);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error creating message', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось создать сообщение');
      res.status(err.status).json(err.body);
    }
  });

  app.put("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user!;
      const id = req.params.id;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const message = await storage.getMessage(id);
      if (!message || message.coupleId !== user.coupleId) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Сообщение не найдено');
        return res.status(err.status).json(err.body);
      }

      // Статус-обновление (прочитано/реакции): доступно обоим партнёрам и
      // сразу рассылается по WS, чтобы реакция или прочтение отразились на
      // стороне собеседника без перезагрузки.
      const hasContentEdit = 'content' in req.body || 'mediaUrl' in req.body || 'type' in req.body;
      if (!hasContentEdit) {
        const statusResult = messageStatusSchema.safeParse(req.body);
        if (statusResult.success) {
        const updates: Partial<Message> = {};
        if (statusResult.data.isRead !== undefined) updates.isRead = statusResult.data.isRead;
        if (statusResult.data.reactions !== undefined) updates.reactions = statusResult.data.reactions;
        const updatedMessage = await storage.updateMessage(id, updates);
        broadcastToPartner({ coupleId: user.coupleId }, {
          type: 'chat_message_update',
          id: updatedMessage.id,
          ...(statusResult.data.isRead !== undefined && { isRead: statusResult.data.isRead }),
          ...(statusResult.data.reactions !== undefined && { reactions: statusResult.data.reactions }),
          timestamp: new Date().toISOString(),
        });
        return res.json(updatedMessage);
      }
      }

      // Полноценное редактирование содержимого — только автор сообщения.
      const validationResult = serverMessageSchema.safeParse(req.body);
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }
      if (message.senderId !== user.id) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Нет доступа к этому сообщению');
        return res.status(err.status).json(err.body);
      }
      // Эфемерное сообщение остаётся эфемерным при любом редактировании:
      // иначе правка сбрасывала бы isEphemeral в false (серверная схема
      // подставляет default false), и сообщение «застывало» вечно. TTL
      // пересчитывается от момента редактирования (сервер-authoritative).
      const updates: Partial<Message> = { ...validationResult.data };
      if (message.isEphemeral) {
        updates.isEphemeral = true;
        const expirationTime = new Date();
        expirationTime.setMinutes(expirationTime.getMinutes() + EPHEMERAL_MESSAGE_TTL_MINUTES);
        updates.expiresAt = expirationTime;
      }
      const updatedMessage = await storage.updateMessage(id, updates);
      res.json(updatedMessage);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error updating message', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось обновить сообщение');
      res.status(err.status).json(err.body);
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user!;
      const id = req.params.id;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const message = await storage.getMessage(id);
      if (!message || message.coupleId !== user.coupleId) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Сообщение не найдено');
        return res.status(err.status).json(err.body);
      }
      if (message.senderId !== user.id) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Нет доступа к этому сообщению');
        return res.status(err.status).json(err.body);
      }
      const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
      await unlinkUploadIfLocal(message.mediaUrl, uploadsBase);
      await storage.deleteMessage(id);
      res.json({ success: true });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error deleting message', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось удалить сообщение');
      res.status(err.status).json(err.body);
    }
  });

  app.get("/api/partner", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      const partner = await storage.getPartnerInfo(user.id);
      
      if (!partner) {
        return res.json({ partner: null });
      }

      const partnerInfo = {
        id: partner.id,
        username: partner.username,
        firstName: partner.firstName,
        lastName: partner.lastName,
        profileImageUrl: partner.profileImageUrl,
        isOnline: partner.isOnline,
        lastSeen: partner.lastSeen,
        role: partner.role
      };
      
      res.json({ partner: partnerInfo });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching partner info', error);
      res.status(500).json({ error: "Failed to fetch partner info" });
    }
  });

  app.get("/api/couple/invite-code", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      if (user.role !== 'main_admin') {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Только главный админ может управлять кодами приглашений');
        return res.status(err.status).json(err.body);
      }
      
      const couple = await storage.getCoupleByUser(user.id);
      if (!couple) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Пара не найдена');
        return res.status(err.status).json(err.body);
      }
      
      res.json({ inviteCode: couple.inviteCode });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching invite code', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить код приглашения');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/couple/revoke-invite", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      if (user.role !== 'main_admin') {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Только главный админ может отзывать коды приглашений');
        return res.status(err.status).json(err.body);
      }
      
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      await storage.revokeInviteCode(user.coupleId);
      res.json({ success: true });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error revoking invite code', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось отозвать код приглашения');
      res.status(err.status).json(err.body);
    }
  });

  app.get("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const couple = await storage.getCoupleById(user.coupleId);
      if (!couple) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Пара не найдена');
        return res.status(err.status).json(err.body);
      }
      return res.json({ settings: couple.settings || {} });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching settings', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить настройки');
      res.status(err.status).json(err.body);
    }
  });

  app.put("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      const { userSettings, coupleSettings } = req.body;
      
      let updatedUser = user;
      let updatedCouple = null;

      if (userSettings) {
        const allowedUserFields = ['firstName', 'lastName', 'profileImageUrl'];
        const filteredUserSettings = Object.keys(userSettings)
          .filter(key => allowedUserFields.includes(key))
          .reduce<Record<string, unknown>>((obj, key) => {
            obj[key] = userSettings[key];
            return obj;
          }, {});

        if (Object.keys(filteredUserSettings).length > 0) {
          const validationResult = updateProfileSchema.safeParse(filteredUserSettings);
          if (!validationResult.success) {
            const err = createApiError(
              400,
              ERROR_CODES.VALIDATION_FAILED,
              'Ошибка валидации данных',
              validationResult.error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message
              }))
            );
            return res.status(err.status).json(err.body);
          }
          updatedUser = await storage.updateUser(user.id, validationResult.data as Partial<User>);
        }
      }

      if (coupleSettings && ['main_admin', 'co_admin'].includes(user.role)) {
        if (!user.coupleId) {
          const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
          return res.status(err.status).json(err.body);
        }
        const settingsValidation = coupleSettingsSchema.safeParse(coupleSettings);
        if (!settingsValidation.success) {
          const err = createApiError(
            400,
            ERROR_CODES.VALIDATION_FAILED,
            'Ошибка валидации данных',
            settingsValidation.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          );
          return res.status(err.status).json(err.body);
        }
        updatedCouple = await storage.updateCoupleSettings(user.coupleId, coupleSettings);
      }
      
      res.json({ 
        user: updatedUser,
        couple: updatedCouple,
        success: true 
      });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error updating settings', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось обновить настройки');
      res.status(err.status).json(err.body);
    }
  });

  app.get("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      const fullUser = await storage.getUser(user.id);
      
      if (!fullUser) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Пользователь не найден');
        return res.status(err.status).json(err.body);
      }
 
      const stats = user.coupleId 
        ? await storage.getProfileStats(user.id, user.coupleId)
        : null;

      const profileInfo = {
        id: fullUser.id,
        username: fullUser.username,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        profileImageUrl: fullUser.profileImageUrl,
        role: fullUser.role,
        coupleId: fullUser.coupleId,
        status: fullUser.status,
        wishlist: fullUser.wishlist || [],
        createdAt: fullUser.createdAt,
        stats
      };
      
      res.json(profileInfo);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching profile', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить профиль');
      res.status(err.status).json(err.body);
    }
  });

  app.put("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      const validationResult = updateProfileSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      if (validationResult.data.username) {
        const existingUser = await storage.getUserByUsername(validationResult.data.username);
        if (existingUser && existingUser.id !== user.id) {
          const err = createApiError(
            409,
            ERROR_CODES.ALREADY_EXISTS,
            'Этот никнейм уже занят',
            [{ field: "username", message: "Этот никнейм уже занят" }]
          );
          return res.status(err.status).json(err.body);
        }
      }
 
      if (validationResult.data.email) {
        const existingUser = await storage.getUserByEmail(validationResult.data.email);
        if (existingUser && existingUser.id !== user.id) {
          const err = createApiError(
            409,
            ERROR_CODES.ALREADY_EXISTS,
            'Этот email уже используется',
            [{ field: "email", message: "Этот email уже используется" }]
          );
          return res.status(err.status).json(err.body);
        }
      }
      
      const updatedUser = await storage.updateUser(user.id, {
        ...validationResult.data,
        updatedAt: new Date()
      });

      const profileInfo = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        profileImageUrl: updatedUser.profileImageUrl,
        role: updatedUser.role,
        coupleId: updatedUser.coupleId,
        status: updatedUser.status,
        wishlist: updatedUser.wishlist || [],
        updatedAt: updatedUser.updatedAt
      };
      
      res.json(profileInfo);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error updating profile', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось обновить профиль');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/avatar", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    avatarUpload.single('avatar')(req, res, (err) => {
      logger.debug(LogContext.UPLOAD, 'Avatar multer middleware called');
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: "File too large",
            message: `Максимальный размер файла: ${formatMaxSizeMb(AVATAR_MAX_SIZE)}`
          });
        }
        
        if (err.message === 'Only image files are allowed (JPEG, PNG, GIF, WebP, HEIC)') {
          return res.status(415).json({
            error: "Unsupported media type",
            message: "Поддерживаются только изображения: JPG, PNG, GIF, WebP"
          });
        }
        
        if (err.code === 'LIMIT_FIELD_COUNT' || err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: "Too many files/fields",
            message: "Можно загружать только один файл"
          });
        }
        
        return res.status(400).json({
          error: "Upload error",
          message: err.message || "Ошибка загрузки файла"
        });
      }
      next();
    });
}, async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        error: "No file uploaded",
        message: "Файл не был загружен"
      });
    }

    try {
      const user = req.user!;

      // Если настроен GCS — грузим аватар в облако и сразу возвращаем URL.
      const cloudAvatarUrl = await uploadToCloudOrNull(file, 'avatars');
      if (cloudAvatarUrl) {
        const previousAvatar = user.profileImageUrl;
        await storage.updateUser(user.id, {
          profileImageUrl: cloudAvatarUrl,
          updatedAt: new Date()
        });

        if (previousAvatar && previousAvatar !== cloudAvatarUrl) {
          const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
          await unlinkUploadIfLocal(previousAvatar, uploadsBase);
        }

        return res.json({ success: true, avatarUrl: cloudAvatarUrl });
      }

      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
      await fs.mkdir(uploadsDir, { recursive: true });

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const ext = path.extname(file.originalname);
      const filename = `${uniqueSuffix}${ext}`;
      const filepath = path.join(uploadsDir, filename);

      await fs.writeFile(filepath, file.buffer);

      const avatarUrl = `/uploads/avatars/${filename}`;
      const previousAvatar = user.profileImageUrl;
      await storage.updateUser(user.id, {
        profileImageUrl: avatarUrl,
        updatedAt: new Date()
      });

      // Чистим предыдущий аватар, если он лежал локально в uploads и заменён
      // новым файлом (внешние URL и путь нового файла игнорируются).
      if (previousAvatar && previousAvatar !== avatarUrl) {
        const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
        await unlinkUploadIfLocal(previousAvatar, uploadsBase);
      }

      return res.json({ success: true, avatarUrl });
    } catch (e) {
      logger.error(LogContext.UPLOAD, 'Error uploading avatar', e);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось загрузить аватар');
      return res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/memory-image", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    imageUpload.single('image')(req, res, (err) => {
      if (err) {
        return handleUploadError(res, err, `Максимальный размер изображения: ${formatMaxSizeMb(MEMORY_IMAGE_MAX_SIZE)}`);
      }

      next();
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Файл не был загружен',
      });
    }

    try {
      const cloudUrl = await uploadToCloudOrNull(file, 'memories');
      if (cloudUrl) {
        return res.json({ url: cloudUrl });
      }
      const url = await writeBufferUpload(file.buffer, file.originalname, 'memories');
      return res.json({ url });
    } catch {
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось загрузить изображение');
      return res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/memory-video", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }

    videoUpload.single('video')(req, res, (err) => {
      if (err) {
        return handleUploadError(res, err, `Максимальный размер видео: ${formatMaxSizeMb(MEMORY_VIDEO_MAX_SIZE)}`);
      }

      next();
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file?.filename) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Файл не был загружен',
      });
    }

    try {
      // Если настроен GCS — грузим видео в облако (файл на диске читается из
      // file.path, а затем удаляется внутри uploadToCloudOrNull).
      const cloudUrl = await uploadToCloudOrNull(file, 'memories');
      if (cloudUrl) {
        return res.json({ url: cloudUrl });
      }

      return res.json({ url: createUploadUrl(`memories/${file.filename}`) });
    } catch {
      const err = createApiError(500, ERROR_CODES.UPLOAD_FAILED, 'Не удалось загрузить видео');
      return res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/document", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }

    documentUpload.single('document')(req, res, (err) => {
      if (err) {
        return handleUploadError(res, err, `Максимальный размер документа: ${formatMaxSizeMb(DOCUMENT_MAX_SIZE)}`);
      }

      next();
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file?.filename) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Файл не был загружен',
      });
    }

    try {
      const cloudUrl = await uploadToCloudOrNull(file, 'documents');
      if (cloudUrl) {
        return res.json({ url: cloudUrl });
      }

      return res.json({ url: createUploadUrl(`documents/${file.filename}`) });
    } catch {
      const err = createApiError(500, ERROR_CODES.UPLOAD_FAILED, 'Не удалось загрузить документ');
      return res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/audio", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }

    audioUpload.single('audio')(req, res, (err) => {
      if (err) {
        return handleUploadError(res, err, `Максимальный размер аудио: ${formatMaxSizeMb(AUDIO_MAX_SIZE)}`);
      }

      next();
    });
  }, async (req, res) => {
    const user = req.user!;
    const file = req.file;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }
    if (!file?.filename || !file.path) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Файл не был загружен',
      });
    }

    try {
      // Если настроен GCS — аудио в облако (временный файл удаляется внутри).
      const cloudUrl = await uploadToCloudOrNull(file, `audios/${user.id}`);
      if (cloudUrl) {
        return res.json({ url: cloudUrl });
      }

      const coupleDir = path.join(process.cwd(), 'public', 'uploads', 'audios', user.id);
      await fs.mkdir(coupleDir, { recursive: true });
      const targetPath = path.join(coupleDir, file.filename);
      await fs.rename(file.path, targetPath);

      return res.json({ url: createUploadUrl(`audios/${user.id}/${file.filename}`) });
    } catch {
      const err = createApiError(500, ERROR_CODES.UPLOAD_FAILED, 'Не удалось загрузить аудио');
      return res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/voice", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }

    voiceMessageUpload.single('voice')(req, res, (err) => {
      if (err) {
        return handleUploadError(res, err, `Максимальный размер голосового сообщения: ${formatMaxSizeMb(VOICE_MESSAGE_MAX_SIZE)}`);
      }

      next();
    });
  }, async (req, res) => {
    const user = req.user!;
    const file = req.file;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }
    if (!file?.filename || !file.path) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Файл не был загружен',
      });
    }

    try {
      // Если настроен GCS — голосовое сообщение в облако.
      const cloudUrl = await uploadToCloudOrNull(file, 'voice');
      if (cloudUrl) {
        return res.json({ url: cloudUrl });
      }

      const voiceDir = path.join(process.cwd(), 'public', 'uploads', 'voice');
      await fs.mkdir(voiceDir, { recursive: true });
      const targetPath = path.join(voiceDir, file.filename);
      try {
        await fs.rename(file.path, targetPath);
      } catch {
        // файл уже лежит в voice/ — просто оставляем как есть
      }

      return res.json({ url: createUploadUrl(`voice/${file.filename}`) });
    } catch {
      const err = createApiError(500, ERROR_CODES.UPLOAD_FAILED, 'Не удалось загрузить голосовое сообщение');
      return res.status(err.status).json(err.body);
    }
  });

  app.post("/api/upload/audio-cover", (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }

    audioCoverUpload.single('image')(req, res, (err) => {
      if (err) {
        return handleUploadError(res, err, `Максимальный размер изображения: ${formatMaxSizeMb(MEMORY_IMAGE_MAX_SIZE)}`);
      }

      next();
    });
  }, async (req, res) => {
    const user = req.user!;
    const file = req.file;
    if (!user.coupleId) {
      return res.status(400).json({ error: 'User not in a couple' });
    }
    if (!file?.filename || !file.path) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Файл не был загружен',
      });
    }

    try {
      // Если настроен GCS — обложка в облако.
      const cloudUrl = await uploadToCloudOrNull(file, `audios/${user.id}/covers`);
      if (cloudUrl) {
        return res.json({ url: cloudUrl });
      }

      const coverDir = path.join(process.cwd(), 'public', 'uploads', 'audios', user.id, 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      const targetPath = path.join(coverDir, file.filename);
      await fs.rename(file.path, targetPath);

      return res.json({ url: createUploadUrl(`audios/${user.id}/covers/${file.filename}`) });
    } catch {
      const err = createApiError(500, ERROR_CODES.UPLOAD_FAILED, 'Не удалось загрузить обложку');
      return res.status(err.status).json(err.body);
    }
  });

  app.get("/api/audios", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.json({ audios: [] });
    }

    try {
      const audiosDir = path.join(process.cwd(), 'public', 'uploads', 'audios', user.id);
      await fs.mkdir(audiosDir, { recursive: true });
      const entries = await fs.readdir(audiosDir, { withFileTypes: true });

      const audios = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filepath = path.join(audiosDir, entry.name);
            const stats = await fs.stat(filepath);

            return {
              name: entry.name,
              url: createUploadUrl(`audios/${user.id}/${entry.name}`),
              modifiedAt: stats.mtime.toISOString(),
            };
          })
      );

      audios.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));

      return res.json({ audios });
    } catch {
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить список аудио');
      return res.status(err.status).json(err.body);
    }
  });

  app.get("/api/partner/audios", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      return res.json({ audios: [] });
    }

    try {
      const partner = await storage.getPartnerInfo(user.id);
      if (!partner) {
        return res.json({ audios: [] });
      }

      const audiosDir = path.join(process.cwd(), 'public', 'uploads', 'audios', partner.id);
      await fs.mkdir(audiosDir, { recursive: true });
      const entries = await fs.readdir(audiosDir, { withFileTypes: true });

      const audios = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filepath = path.join(audiosDir, entry.name);
            const stats = await fs.stat(filepath);

            return {
              name: entry.name,
              url: createUploadUrl(`audios/${partner.id}/${entry.name}`),
              modifiedAt: stats.mtime.toISOString(),
            };
          })
      );

      audios.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));

      return res.json({ audios });
    } catch {
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить список аудио');
      return res.status(err.status).json(err.body);
    }
  });

  app.delete("/api/audios", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user!;
    if (!user.coupleId) {
      const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
      return res.status(err.status).json(err.body);
    }

    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!url) {
      const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Не указан URL аудио');
      return res.status(err.status).json(err.body);
    }

    const expectedPrefix = createUploadUrl(`audios/${user.id}/`);
    if (!url.startsWith(expectedPrefix) || url.includes('/covers/')) {
      const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Нет доступа к этому аудио');
      return res.status(err.status).json(err.body);
    }

    const uploadsBase = path.join(process.cwd(), 'public', 'uploads');
    const userAudioDir = path.join(uploadsBase, 'audios', user.id);
    const audioPath = resolveUploadPath(url, uploadsBase);
    if (!audioPath || !audioPath.startsWith(userAudioDir + path.sep)) {
      const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Нет доступа к этому аудио');
      return res.status(err.status).json(err.body);
    }

    // Обложка трека хранится клиентом (localStorage) и передаётся отдельным
    // параметром. Удаляем её только если она принадлежит covers/ этой пары —
    // иначе игнорируем (её может не быть, либо она вне зоны доступа).
    const coverUrl = typeof req.query.cover === 'string' ? req.query.cover : '';
    const coverPrefix = createUploadUrl(`audios/${user.id}/covers/`);
    const coverToDelete = coverUrl.startsWith(coverPrefix) ? coverUrl : null;

    try {
      await fs.unlink(audioPath);
      if (coverToDelete) {
        const coverPath = resolveUploadPath(coverToDelete, uploadsBase);
        if (coverPath && coverPath.startsWith(path.join(userAudioDir, 'covers') + path.sep)) {
          await unlinkUploadIfLocal(coverToDelete, uploadsBase);
        }
      }
      return res.json({ success: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Аудио не найдено');
        return res.status(err.status).json(err.body);
      }

      const err = createApiError(500, ERROR_CODES.UPLOAD_FAILED, 'Не удалось удалить аудио');
      return res.status(err.status).json(err.body);
    }
  });

  app.get("/api/couple", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const couple = await storage.getCoupleById(user.coupleId);
      if (!couple) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Пара не найдена');
        return res.status(err.status).json(err.body);
      }
      const { inviteCode: _inviteCode, ...safeCouple } = couple;
      res.json(safeCouple);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching couple', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить пару');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/couple/invite", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      if (user.role !== "main_admin") {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'Только главный админ может генерировать коды приглашений');
        return res.status(err.status).json(err.body);
      }
      
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const inviteCode = await storage.generateInviteCode(user.coupleId);
      res.json({ inviteCode });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error generating invite code', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось сгенерировать код приглашения');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/couple/join", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const validationResult = joinCoupleSchema.safeParse(req.body);
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      const user = req.user!;
      const { inviteCode } = validationResult.data;
      
      try {
        await storage.joinCouple(user.id, inviteCode);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'Invalid invite code') {
          const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Неверный код приглашения');
          return res.status(err.status).json(err.body);
        }
        if (message === 'User already in a couple') {
          const err = createApiError(409, ERROR_CODES.CONFLICT, 'Вы уже состоите в паре');
          return res.status(err.status).json(err.body);
        }
        if (message === 'Couple is full') {
          const err = createApiError(409, ERROR_CODES.CONFLICT, 'В паре уже есть двое участников');
          return res.status(err.status).json(err.body);
        }
        if (message === 'User not found') {
          const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Пользователь не найден');
          return res.status(err.status).json(err.body);
        }
        throw error;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error joining couple', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось присоединиться к паре');
      res.status(err.status).json(err.body);
    }
  });

  app.get("/api/counters", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const counters = await storage.getCountersForCouple(user.coupleId);
      res.json(counters);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching counters', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить счётчики');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/counters", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }

      const validationResult = serverCounterSchema.safeParse(req.body);
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      const counter = await storage.createCounter({
        ...validationResult.data,
        coupleId: user.coupleId,
      });
      res.status(201).json(counter);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error creating counter', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось создать счётчик');
      res.status(err.status).json(err.body);
    }
  });

  app.put("/api/counters/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }

      const id = req.params.id;
      const ownCounters = await storage.getCountersForCouple(user.coupleId);
      if (!ownCounters.some(c => c.id === id)) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Счётчик не найден');
        return res.status(err.status).json(err.body);
      }

      const validationResult = serverCounterSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }

      const updated = await storage.updateCounter(id, validationResult.data);
      res.json(updated);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error updating counter', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось обновить счётчик');
      res.status(err.status).json(err.body);
    }
  });

  app.delete("/api/counters/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }

      const id = req.params.id;
      const ownCounters = await storage.getCountersForCouple(user.coupleId);
      if (!ownCounters.some(c => c.id === id)) {
        const err = createApiError(404, ERROR_CODES.NOT_FOUND, 'Счётчик не найден');
        return res.status(err.status).json(err.body);
      }

      await storage.deleteCounter(id);
      res.json({ success: true });
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error deleting counter', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось удалить счётчик');
      res.status(err.status).json(err.body);
    }
  });

  app.get("/api/games", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      const guestAccess = await checkGuestAccess(user, user.coupleId);
      if (!guestAccess.canPlayGames) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'У вас нет доступа к играм');
        return res.status(err.status).json(err.body);
      }
      const games = await storage.getGamesForCouple(user.coupleId);
      res.json(games);
    } catch (error) {
      logger.error(LogContext.ROUTES, 'Error fetching games', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось получить игры');
      res.status(err.status).json(err.body);
    }
  });

  app.post("/api/games", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;

      const validationResult = serverGameSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const err = createApiError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          'Ошибка валидации данных',
          validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        );
        return res.status(err.status).json(err.body);
      }
      
      if (!user.coupleId) {
        const err = createApiError(400, ERROR_CODES.BAD_REQUEST, 'Пользователь не состоит в паре');
        return res.status(err.status).json(err.body);
      }
      
      const guestAccess = await checkGuestAccess(user, user.coupleId);
      if (!guestAccess.canPlayGames) {
        const err = createApiError(403, ERROR_CODES.FORBIDDEN, 'У вас нет доступа к играм');
        return res.status(err.status).json(err.body);
      }
      
      const gameData = {
        ...validationResult.data,
        coupleId: user.coupleId,
      };
      
      // Оба партнёра должны играть в одну и ту же партию: иначе каждый
      // создавал свою запись со своим gameId, и клиенты в одной паре имели
      // разные id (сервер маршрутизирует WS-действия по coupleId, поэтому
      // игра всё равно работала, но сохранение состояния шло в две записи).
      // Если активная партия этого типа уже есть — переиспользуем её.
      const existingGames = await storage.getGamesForCouple(user.coupleId);
      const activeGame = existingGames.find(g => g.type === gameData.type && g.isActive);
      if (activeGame) {
        return res.json(activeGame);
      }
      
      const game = await storage.createGame(gameData);
      res.json(game);
    } catch (error) {
      logger.error(LogContext.GAME, 'Error creating game', error);
      const err = createApiError(500, ERROR_CODES.DATABASE_ERROR, 'Не удалось создать игру');
      res.status(err.status).json(err.body);
    }
  });

  const httpServer = createServer(app);

  // verifyClient кладёт сюда результат аутентификации сессии, а обработчик
  // 'connection' читает их из того же запроса.
  interface AuthenticatedIncomingMessage extends IncomingMessage {
    userId?: string;
    clientIp?: string;
  }

  const wss = new WebSocketServer({
    server: httpServer, 
    path: '/ws',
    verifyClient: (info, next) => {
      try {
        const host = info.req.headers.host;
        const origin = info.origin;
        
        if (!host) {
          logger.warn(LogContext.WS, 'Connection rejected: No host header');
          return next(false, 400, 'Bad Request');
        }

        const allowedOrigins = [
          `http://${host}`,
          `https://${host}`
        ];

        if (host.includes('localhost') || host.includes('127.0.0.1')) {
          const localhostVariants = [
            `http://localhost:${host.split(':')[1] || 80}`,
            `http://127.0.0.1:${host.split(':')[1] || 80}`,
          ];
          allowedOrigins.push(...localhostVariants);
        }

        if (!origin) {
          logger.warn(LogContext.WS, 'Connection rejected: No origin header');
          return next(false, 403, 'Forbidden');
        }

        const originValid = allowedOrigins.includes(origin) || 
          (origin.includes('localhost') && (host.includes('localhost') || host.includes('127.0.0.1'))) ||
          (origin.includes('127.0.0.1') && (host.includes('localhost') || host.includes('127.0.0.1')));
        
        if (!originValid) {
          logger.warn(LogContext.WS, `Connection rejected: Origin mismatch. Allowed: ${allowedOrigins.join(', ')}, Got: ${origin}`);
          return next(false, 403, 'Forbidden');
        }

        const clientIp = getClientIp(info.req);
        const rateLimitResult = checkWsRateLimit(clientIp);
        
        if (!rateLimitResult.allowed) {
          logger.warn(LogContext.WS, `Connection rejected: Rate limit exceeded for IP ${clientIp}. Current: ${rateLimitResult.currentCount}/${WS_MAX_CONNECTIONS_PER_IP}`);
          return next(false, 429, 'Too Many Connections');
        }
        
        logger.info(LogContext.WS, `Rate limit OK for IP ${clientIp}: ${rateLimitResult.currentCount}/${WS_MAX_CONNECTIONS_PER_IP} connections`);

        const cookies = parseCookie(info.req.headers.cookie || '');
        const sessionCookie = cookies['connect.sid'];
        
        if (!sessionCookie) {
          logger.warn(LogContext.WS, 'Connection rejected: No session cookie');
          return next(false, 401, 'Unauthorized');
        }

        let sessionId: string;
        if (sessionCookie.startsWith('s:')) {
          const parts = sessionCookie.slice(2).split('.');
          sessionId = parts[0];
        } else if (sessionCookie.includes('.')) {
          sessionId = sessionCookie.split('.')[0];
        } else {
          sessionId = sessionCookie;
        }

        if (!sessionId || sessionId.length < 10) {
          logger.warn(LogContext.WS, 'Connection rejected: Invalid session ID format');
          return next(false, 401, 'Unauthorized');
        }

        storage.sessionStore.get(sessionId, (err, session) => {
          if (err) {
            logger.error(LogContext.WS, 'Session store error', err);
            return next(false, 500, 'Internal Server Error');
          }

          const passportUser = (
            session as { passport?: { user?: string } } | null | undefined
          )?.passport?.user;
          if (!passportUser) {
            logger.warn(LogContext.WS, 'Connection rejected: Invalid or expired session');
            return next(false, 401, 'Unauthorized');
          }

          const authReq = info.req as AuthenticatedIncomingMessage;
          authReq.userId = passportUser;
          authReq.clientIp = clientIp;
          incrementWsConnection(clientIp);
          next(true);
        });
        
      } catch (error) {
        logger.error(LogContext.WS, 'Authentication error', error);
        next(false, 500, 'Internal Server Error');
      }
    }
  });

  const heartbeat = setInterval(() => {
    const timestamp = new Date().toISOString();
    let activeCount = 0;
    let pingCount = 0;
    let terminateCount = 0;
    
    wss.clients.forEach((ws: WebSocket) => {
      const meta = authenticatedConnections.get(ws);
      if (!meta) return;
      activeCount++;

      if (meta.isAlive === false) {
        try { 
          ws.terminate(); 
          terminateCount++;
          logger.info(LogContext.HEARTBEAT, `${timestamp} - Terminated unresponsive connection for user ${meta.userId}`);
        } catch (err) {
          logger.error(LogContext.HEARTBEAT, `${timestamp} - Error terminating connection`, err);
        }
        // Счётчик и запись в authenticatedConnections почистит обработчик
        // 'close' (он зарегистрирован на каждый сокет). Ручной декремент здесь
        // приводил к ДВОЙНОМУ уменьшению счётчика для одного соединения.
        return;
      }

      meta.isAlive = false;
      try { 
        ws.ping(); 
        pingCount++;
      } catch (err) {
        logger.error(LogContext.HEARTBEAT, `${timestamp} - Error sending ping to user ${meta.userId}`, err);
      }
    });

    if (activeCount > 0) {
      logger.info(LogContext.HEARTBEAT, `${timestamp} - Active: ${activeCount}, Pings: ${pingCount}, Terminated: ${terminateCount}`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Фоновые задачи сервера, привязанные к жизненному циклу WS-сервера:
  // очистка счётчиков WS-подключений и очистка просроченных эфемерных сообщений
  // (+ их файлов). .unref(), чтобы таймеры сами по себе не держали процесс живым
  // (тесты/скрипты); останавливаются в обработчике wss 'close' ниже.
  const wsCountsCleanup = setInterval(cleanupWsConnectionCounts, WS_CONNECTION_CLEANUP_INTERVAL_MS);
  wsCountsCleanup.unref();

  const ephemeralPurge = setInterval(() => {
    purgeExpiredMessages().catch(err =>
      logger.error(LogContext.ROUTES, 'Не удалось очистить просроченные сообщения', err),
    );
  }, EPHEMERAL_CLEANUP_INTERVAL_MS);
  ephemeralPurge.unref();

  wss.on('connection', async (ws, req) => {
    let clientIp: string | undefined;
    try {
      const authReq = req as AuthenticatedIncomingMessage;
      const userId = authReq.userId;
      clientIp = authReq.clientIp || getClientIp(req);
      // Счётчик WS-подключений был увеличен в verifyClient. Если соединение
      // отклоняем здесь, нужно сразу вернуть счётчик: 'close' на таком сокете
      // может не наступить, и лимит на IP «протекал» бы до сброса таймера.
      const rejectConnection = (code: number, reason: string) => {
        if (clientIp) decrementWsConnection(clientIp);
        ws.close(code, reason);
      };
      if (!userId) {
        rejectConnection(1008, 'User not found or not in a couple');
        return;
      }
      const user = await storage.getUser(userId);
      
      if (!user || !user.coupleId) {
        rejectConnection(1008, 'User not found or not in a couple');
        return;
      }

      const connectionInfo = {
        userId: user.id,
        coupleId: user.coupleId,
        ws: ws,
        isAlive: true,
        clientIp: clientIp
      };
      authenticatedConnections.set(ws, connectionInfo);

      await storage.updateUser(user.id, { isOnline: true });
      
      logger.info(LogContext.WS, `WebSocket connected: User ${user.username} from couple ${user.coupleId}`);

      authenticatedConnections.forEach((connInfo, clientWs) => {
        if (connInfo.coupleId === connectionInfo.coupleId && 
            connInfo.userId !== connectionInfo.userId && 
            clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'partner_status_change',
            partnerId: user.id,
            isOnline: true,
            timestamp: new Date().toISOString()
          }));
        }
      });

      authenticatedConnections.forEach((connInfo, _clientWs) => {
        if (connInfo.coupleId === connectionInfo.coupleId &&
            connInfo.userId !== connectionInfo.userId) {
          ws.send(JSON.stringify({
            type: 'partner_status_change',
            partnerId: connInfo.userId,
            isOnline: true,
            timestamp: new Date().toISOString()
          }));
        }
      });

      ws.on('pong', () => {
        const meta = authenticatedConnections.get(ws);
        if (meta) meta.isAlive = true;
      });

      ws.on('message', async (message) => {
        try {
          const raw = message.toString();
          if (raw.length > MAX_WS_MESSAGE_SIZE) {
            ws.send(JSON.stringify({ type: 'error', message: 'Сообщение слишком большое' }));
            return;
          }
          let data: unknown;
          try {
            data = JSON.parse(raw) as unknown;
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Некорректный JSON' }));
            return;
          }
          const allowedTypes = new Set([
            'chat_message',
            'game_action',
            'game_invitation',
            'typing_start',
            'typing_stop',
            'presence_ping',
          ]);
          if (
            typeof data !== 'object' ||
            data === null ||
            !('type' in data) ||
            typeof (data as { type: unknown }).type !== 'string' ||
            !allowedTypes.has((data as { type: string }).type)
          ) {
            ws.send(JSON.stringify({ type: 'error', message: 'Недопустимый тип сообщения' }));
            return;
          }

          // Дальше диспетчеризуем по дискриминанту type; содержимое каждого
          // варианта валидируется отдельной zod-схемой ниже.
          const msg = data as WsIncomingMessage;

          if (msg.type === 'chat_message') {
            const validationResult = wsChatMessageSchema.safeParse(msg);

            if (!validationResult.success) {
              logger.warn(LogContext.WS, 'Invalid chat message received', validationResult.error.errors);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Недопустимое сообщение чата',
                details: validationResult.error.errors.map(err => ({
                  field: err.path.join('.'),
                  message: err.message
                }))
              }));
              return;
            }

            const validated = validationResult.data;

            // senderId и timestamp проставляет сервер по сессии — клиентские
            // значения игнорируются, чтобы нельзя было выдать себя за партнёра.
            const messageData: InsertMessage = {
              coupleId: connectionInfo.coupleId,
              senderId: user.id,
              type: validated.mediaType === 'voice' ? 'voice' : (validated.mediaType ?? 'text'),
              content: validated.content ?? '',
              mediaUrl: validated.mediaUrl ?? null,
              isEphemeral: validated.isEphemeral,
            };
            if (messageData.isEphemeral) {
              const expirationTime = new Date();
              expirationTime.setMinutes(expirationTime.getMinutes() + EPHEMERAL_MESSAGE_TTL_MINUTES);
              messageData.expiresAt = expirationTime;
            }

            let saved: Message;
            try {
              saved = await storage.createMessage(messageData);
            } catch (err) {
              logger.error(LogContext.WS, 'Failed to persist chat message', err);
              ws.send(JSON.stringify({ type: 'error', message: 'Не удалось сохранить сообщение' }));
              return;
            }

            broadcastToPartner(connectionInfo, toChatMessagePayload(saved), ws);
          } else if (msg.type === 'game_action') {
            const validationResult = wsGameActionSchema.safeParse(msg);
            
            if (!validationResult.success) {
              logger.error(LogContext.GAME, 'Invalid game action received', validationResult.error.errors);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Недопустимое игровое действие',
                details: validationResult.error.errors.map(err => ({
                  field: err.path.join('.'),
                  message: err.message
                }))
              }));
              return;
            }
            
            const validatedData = validationResult.data;

            if (validatedData.senderId !== user.id) {
              logger.error(LogContext.GAME, `Game action sender mismatch: expected ${user.id}, got ${validatedData.senderId}`);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Неавторизованное игровое действие'
              }));
              return;
            }

            const guestAccess = await checkGuestAccess(user, connectionInfo.coupleId);
            if (!guestAccess.canPlayGames) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'У вас нет доступа к играм'
              }));
              return;
            }

            logger.warn(LogContext.GAME, `Game action received: ${validatedData.gameType} - ${validatedData.action} from user ${user.username}`);

            // Для финальных действий (game_completed/round_finished) проверяем
            // принадлежность игры паре ДО пересылки партнёру: иначе клиент мог
            // бы подсунуть чужой gameId и форвардить фиктивные результаты.
            let coupleGameOwned = true;
            if (validatedData.action === 'game_completed' || validatedData.action === 'round_finished') {
              try {
                const coupleGames = await storage.getGamesForCouple(connectionInfo.coupleId);
                coupleGameOwned = coupleGames.some((game) => game.id === validatedData.gameId);
              } catch (ownershipError) {
                logger.error(LogContext.GAME, 'Failed to verify game ownership', ownershipError);
              }
              if (!coupleGameOwned) {
                logger.error(LogContext.GAME, `Game action rejected: game ${validatedData.gameId} does not belong to couple ${connectionInfo.coupleId}`);
                return;
              }
            }

            authenticatedConnections.forEach((connInfo, clientWs) => {
              if (clientWs !== ws && 
                  connInfo.coupleId === connectionInfo.coupleId && 
                  clientWs.readyState === WebSocket.OPEN) {

                const gameMessage = {
                  type: 'game_action',
                  gameType: validatedData.gameType,
                  gameId: validatedData.gameId,
                  action: validatedData.action,
                  data: validatedData.data,
                  senderId: validatedData.senderId,
                  timestamp: new Date().toISOString()
                };
                
                clientWs.send(JSON.stringify(gameMessage));
                logger.warn(LogContext.GAME, `Game action forwarded to partner in couple ${connectionInfo.coupleId}`);
              }
            });

            if (validatedData.action === 'game_completed' || validatedData.action === 'round_finished') {
              try {
                const payload = validatedData.data || {};
                const isCompleted = validatedData.action === 'game_completed';
                const gameUpdate: { state: Record<string, unknown>; isActive?: boolean; updatedAt: Date } = {
                  state: {
                    ...(payload.gameState && typeof payload.gameState === 'object' ? payload.gameState : {}),
                    // Сохраняем итоговые результаты раунда/игры, чтобы они не
                    // терялись при перезагрузке страницы (см. /api/games).
                    lastResult: payload,
                  },
                  updatedAt: new Date()
                };
                if (isCompleted) {
                  gameUpdate.isActive = false;
                }
                await storage.updateGame(validatedData.gameId, gameUpdate);
              } catch (gameUpdateError) {
                logger.error(LogContext.GAME, 'Failed to update game state', gameUpdateError);
              }
            }
            
          } else if (msg.type === 'game_invitation') {
            logger.warn(LogContext.GAME, `Game invitation received: ${String(msg.gameType)} from user ${user.username}`);

            if (typeof msg.gameType !== 'string') {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Некорректные данные приглашения'
              }));
              return;
            }

            authenticatedConnections.forEach((connInfo, clientWs) => {
              if (clientWs !== ws && 
                  connInfo.coupleId === connectionInfo.coupleId && 
                  clientWs.readyState === WebSocket.OPEN) {
                
                const invitationMessage = {
                  type: 'game_invitation',
                  gameType: msg.gameType,
                  gameTitle: msg.gameTitle || 'Игра',
                  inviterName: user.username,
                  inviterId: user.id,
                  message: msg.message || `${user.username} приглашает вас поиграть в "${msg.gameTitle || msg.gameType}"`,
                  timestamp: new Date().toISOString()
                };
                
                clientWs.send(JSON.stringify(invitationMessage));
                logger.warn(LogContext.GAME, `Game invitation sent to partner in couple ${connectionInfo.coupleId}`);
              }
            });

            ws.send(JSON.stringify({
              type: 'invitation_sent',
              gameType: msg.gameType,
              timestamp: new Date().toISOString()
            }));
            
          } else if (msg.type === 'typing_start' || msg.type === 'typing_stop') {
            authenticatedConnections.forEach((connInfo, clientWs) => {
              if (clientWs !== ws && 
                  connInfo.coupleId === connectionInfo.coupleId && 
                  clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: msg.type,
                  userId: user.id,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          } else if (msg.type === 'presence_ping') {
            try {
              await storage.updateUser(user.id, { lastSeen: new Date() });
            } catch (pingErr) {
              logger.error(LogContext.WS, 'Failed to update lastSeen on presence_ping', pingErr);
            }
            const partnerConnInfo = Array.from(authenticatedConnections.values()).find(
              connInfo => connInfo.coupleId === connectionInfo.coupleId && connInfo.userId !== connectionInfo.userId
            );
            ws.send(JSON.stringify({
              type: 'presence_ack',
              partnerId: partnerConnInfo?.userId ?? null,
              partnerOnline: !!partnerConnInfo && partnerConnInfo.ws.readyState === WebSocket.OPEN,
              timestamp: new Date().toISOString()
            }));
          }
        } catch (error) {
          logger.error(LogContext.WS, 'WebSocket message error', error);
        }
      });

      const hasOtherLiveConnection = (userId: string, exceptWs: WebSocket) => {
        return Array.from(authenticatedConnections.entries()).some(
          ([clientWs, connInfo]) =>
            connInfo.userId === userId && clientWs !== exceptWs && clientWs.readyState === WebSocket.OPEN
        );
      };

      const notifyPartnerOffline = async () => {
        authenticatedConnections.forEach((connInfo, clientWs) => {
          if (connInfo.coupleId === connectionInfo.coupleId && 
              connInfo.userId !== connectionInfo.userId && 
              clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'partner_status_change',
              partnerId: user.id,
              isOnline: false,
              lastSeen: new Date().toISOString(),
              timestamp: new Date().toISOString()
            }));
          }
        });
      };

      const updateUserOffline = async () => {
        try {
          await storage.updateUser(user.id, { 
            isOnline: false, 
            lastSeen: new Date() 
          });
        } catch (e) {
          logger.error(LogContext.WS, 'Failed to update user offline status', e);
        }
      };

      ws.on('close', async () => {
        if (connectionInfo.clientIp) {
          decrementWsConnection(connectionInfo.clientIp);
        }
        authenticatedConnections.delete(ws);
        logger.info(LogContext.WS, `WebSocket disconnected: User ${user.username}`);

        if (hasOtherLiveConnection(user.id, ws)) {
          return;
        }

        await updateUserOffline();
        await notifyPartnerOffline();
      });

      ws.on('error', async (error) => {
        logger.error(LogContext.WS, 'WebSocket error', error);
        authenticatedConnections.delete(ws);

        if (hasOtherLiveConnection(user.id, ws)) {
          return;
        }

        await updateUserOffline();
        await notifyPartnerOffline();
      });

    } catch (error) {
      logger.error(LogContext.WS, 'WebSocket connection setup error', error);
      if (clientIp) decrementWsConnection(clientIp);
      ws.close(1011, 'Internal server error');
    }
  });

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(wsCountsCleanup);
    clearInterval(ephemeralPurge);
  });

  // Отдаём наружу и HTTP-сервер, и WS-сервер: при graceful shutdown нужно
  // закрыть живые WS-подключения до остановки HTTP-сервера, иначе они
  // держат процесс открытым до таймаута принудительного выхода.
  (httpServer as Server & { wss?: WebSocketServer }).wss = wss;

  return httpServer;
}
