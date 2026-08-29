import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { GameType, gameTypeValues, type GameType as WsGameType } from "./ws-messages";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  role: text("role", { enum: ["main_admin", "co_admin", "guest"] }).notNull().default("guest"),
  coupleId: varchar("couple_id"),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  status: text("status"),
  wishlist: jsonb("wishlist").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const couples = pgTable("couples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mainAdminId: varchar("main_admin_id").notNull(),
  coAdminId: varchar("co_admin_id"),
  inviteCode: text("invite_code").unique(),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const memories = pgTable("memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  authorId: varchar("author_id").notNull(),
  title: text("title"),
  content: text("content"),
  type: text("type").notNull(), // 'photo', 'video', 'text', 'quote'
  mediaUrl: text("media_url"),
  thumbnailUrl: text("thumbnail_url"),
  visibility: jsonb("visibility").default({}), // guest permissions
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memoryId: varchar("memory_id").notNull(),
  authorId: varchar("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  content: text("content"),
  type: text("type").notNull(), // 'text', 'image', 'video', 'voice', 'ephemeral_image', 'ephemeral_video'
  mediaUrl: text("media_url"),
  isEphemeral: boolean("is_ephemeral").default(false),
  expiresAt: timestamp("expires_at"),
  isRead: boolean("is_read").default(false),
  reactions: jsonb("reactions").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  type: text("type").notNull(),
  state: jsonb("state").default({}),
  currentPlayer: varchar("current_player"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const counters = pgTable("counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  name: text("name").notNull(),
  value: integer("value").default(0),
  targetDate: timestamp("target_date"),
  isVisible: boolean("is_visible").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSeen: true,
  isOnline: true,
});

export const insertCoupleSchema = createInsertSchema(couples).omit({
  id: true,
  createdAt: true,
});

export const insertMemorySchema = createInsertSchema(memories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
}).extend({
  // Пустые комментарии не сохраняем: пробелы/переносы — тоже пусто.
  content: z.string().trim().min(1, 'Комментарий не может быть пустым'),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

const isAllowedMessageMediaUrl = (value: string | null | undefined) => {
  return value == null || /^(https?:\/\/|\/uploads\/)/.test(value);
};

export const serverMessageSchema = insertMessageSchema.omit({
  coupleId: true,
  senderId: true,
  expiresAt: true,
}).extend({
  content: z.string().optional().nullable(),
  type: z.enum(['text', 'image', 'video', 'voice', 'ephemeral_image', 'ephemeral_video', 'document']),
  mediaUrl: z.string().optional().nullable().refine(isAllowedMessageMediaUrl, {
    message: 'Must be absolute URL or local /uploads/ path',
  }),
  isEphemeral: z.boolean().optional().default(false),
}).superRefine((value, ctx) => {
  if ((value.type === 'image' || value.type === 'video' || value.type === 'ephemeral_image' || value.type === 'ephemeral_video' || value.type === 'document') && !value.mediaUrl) {
    ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'URL медиа обязателен для изображений и видео' });
  }
  if (value.type === 'text' && (!value.content || value.content.trim() === '')) {
    ctx.addIssue({ code: 'custom', path: ['content'], message: 'Содержимое обязательно для текстовых сообщений' });
  }
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  coupleId: z.string().uuid(),
  type: z.enum(gameTypeValues, {
    errorMap: () => ({ message: 'Недопустимый тип игры' })
  }),
  state: z.record(z.unknown()).optional().default({}),
  currentPlayer: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const serverGameSchema = insertGameSchema.omit({
  coupleId: true,
  currentPlayer: true,
});

export const wsGameActionSchema = z.object({
  type: z.literal('game_action'),
  gameType: z.enum(gameTypeValues),
  gameId: z.string().uuid(),
  action: z.string().min(1).max(50), // Limit action name length
  data: z.record(z.unknown()).refine(
    (obj) => JSON.stringify(obj).length <= 10000, // Limit payload size to 10KB
    { message: 'Данные игрового действия слишком велики (макс. 10KB)' }
  ),
  senderId: z.string().uuid(),
});

// Валидация входящего WS-сообщения чата. senderId здесь намеренно НЕ описан:
// z.object по умолчанию отбрасывает неизвестные ключи, поэтому клиентский
// senderId (и любые иные лишние поля) отбрасывается — отправителя определяет
// сервер по сессии, а не клиент. Форму исходящего сообщения см. ChatMessageIn.
export const wsChatMessageSchema = z
  .object({
    type: z.literal('chat_message'),
    content: z.string().optional().nullable(),
    mediaUrl: z
      .string()
      .optional()
      .nullable()
      .refine(isAllowedMessageMediaUrl, {
        message: 'Must be absolute URL or local /uploads/ path',
      }),
    mediaType: z.enum(['image', 'video', 'voice']).optional(),
    isEphemeral: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    const hasContent = typeof value.content === 'string' && value.content.trim() !== '';
    if (!hasContent && !value.mediaUrl) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Сообщение не может быть пустым' });
    }
    if (value.mediaType && !value.mediaUrl) {
      ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'URL медиа обязателен при указанном типе медиа' });
    }
  });

export const messageStatusSchema = z.object({
  // Реакции: эмодзи → список userId, кто поставил. Синхронизируется между
  // партнёрами через WS (chat_message_update).
  isRead: z.boolean().optional(),
  reactions: z.record(z.string(), z.array(z.string())).optional(),
}).refine(
  (data) => data.isRead !== undefined || data.reactions !== undefined,
  { message: 'Должно быть обновлено хотя бы одно поле' }
);

export const insertCounterSchema = createInsertSchema(counters).omit({
  id: true,
  createdAt: true,
});

// Серверная схема для /api/counters: coupleId проставляет сервер из сессии
// (как для сообщений и игр), а targetDate приходит от клиента строкой из
// <input type="date"> — пустая строка/null/отсутствие поля → null.
export const serverCounterSchema = insertCounterSchema.omit({
  coupleId: true,
}).extend({
  targetDate: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return null;
      return val instanceof Date ? val : new Date(String(val));
    },
    z.date().nullable()
  ),
});

const isHttpUrl = (s: string) => {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
};

export const updateProfileSchema = z.object({
  username: z.string().min(1, 'Никнейм обязателен').max(50, 'Никнейм не может быть длиннее 50 символов').optional(),
  firstName: z.string().max(100, 'Имя не может быть длиннее 100 символов').optional().nullable(),
  lastName: z.string().max(100, 'Фамилия не может быть длиннее 100 символов').optional().nullable(),
  profileImageUrl: z.string().refine(
    (v) => isHttpUrl(v) || v.startsWith('/uploads/'),
    { message: 'Некорректный URL изображения' }
  ).nullable().optional(),
  email: z.string().email('Некорректный email').optional(),
  status: z.string().max(1000, 'Статус слишком длинный').optional().nullable(),
  wishlist: z.array(z.object({
    title: z.string().min(1, 'Название обязательно'),
    link: z.string().url('Некорректная ссылка').optional().nullable(),
  })).optional(),
}).refine(
  (data) => Object.values(data).some(value => value !== undefined),
  { message: 'Должно быть обновлено хотя бы одно поле' }
);

export const profileStatsSchema = z.object({
  memoriesCount: z.number().min(0),
  messagesCount: z.number().min(0),
  gamesCount: z.number().min(0),
  daysInCouple: z.number().min(0),
  placesVisited: z.number().min(0),
});

export const coupleSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['ru', 'en']).optional(),
  // Настройки уведомлений сохраняются как плоские флаги (совпадает с формой на
  // странице настроек). Доставка (email/push/Sound) пока не реализована — это
  // только пользовательские предпочтения на будущее.
  notifications: z.object({
    emailNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    soundNotifications: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    guestCanViewMemories: z.boolean().optional(),
    guestCanComment: z.boolean().optional(),
    guestCanPlayGames: z.boolean().optional(),
  }).optional(),
  relationshipStartDate: z.string().optional().nullable(), // ISO date string
}).partial();

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Couple = typeof couples.$inferSelect;
export type InsertCouple = z.infer<typeof insertCoupleSchema>;
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Counter = typeof counters.$inferSelect;
export type InsertCounter = z.infer<typeof insertCounterSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type ProfileStats = z.infer<typeof profileStatsSchema>;
export type CoupleSettings = z.infer<typeof coupleSettingsSchema>;

export interface PartnerInfo {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isOnline: boolean | null;
  lastSeen: string | null; // ISO date string for JSON compatibility
  role: string;
}

export interface PartnerResponse {
  partner: PartnerInfo | null;
}

export interface ChatMessagePayload {
  type: 'chat_message';
  id: string;
  content: string | null;
  senderId: string;
  timestamp: string; // ISO date string
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'voice';
  isEphemeral?: boolean;
  expiresAt?: string;
}

export interface ChatMessageIncoming {
  type: 'chat_message';
  senderId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'voice';
  isEphemeral?: boolean;
  timestamp: string;
}

export interface TypingIndicator {
  type: 'typing_start' | 'typing_stop';
  userId: string;
  timestamp: string;
}

export interface PartnerStatusUpdate {
  type: 'partner_status_change';
  partnerId: string;
  isOnline: boolean;
  lastSeen?: string;
  timestamp: string;
}

export interface ChatMessageUpdatePayload {
  type: 'chat_message_update';
  id: string;
  isRead?: boolean;
  reactions?: Record<string, string[]>;
  timestamp: string;
}

export type ChatIncomingMessage = ChatMessageIncoming | TypingIndicator | PartnerStatusUpdate | ChatMessageUpdatePayload;

export interface BaseGameMessage {
  type: 'game_action';
  gameType: WsGameType;
  gameId: string;
  senderId: string;
  action: string;
  data?: unknown;
}

export interface PartnerQuizRoundStarted extends BaseGameMessage {
  gameType: typeof GameType.PARTNER_QUIZ;
  action: 'round_started';
  questions: Array<{
    id: string;
    text: string;
    type: 'choice' | 'text' | 'number';
    options?: string[];
    category: 'preferences' | 'memories' | 'dreams' | 'favorites';
  }>;
}

export interface PartnerQuizAnswersSubmitted extends BaseGameMessage {
  gameType: typeof GameType.PARTNER_QUIZ;
  action: 'answers_submitted';
  answers: Array<{
    questionId: string;
    answer: string;
  }>;
}

export interface PartnerQuizGuessesSubmitted extends BaseGameMessage {
  gameType: typeof GameType.PARTNER_QUIZ;
  action: 'guesses_submitted';
  guesses: Array<{
    questionId: string;
    answer: string;
  }>;
}

export interface RolePlayingScenarioSelected extends BaseGameMessage {
  gameType: typeof GameType.ROLE_PLAYING;
  action: 'scenario_selected';
  scenarioId: string;
}

export interface RolePlayingRolesAssigned extends BaseGameMessage {
  gameType: typeof GameType.ROLE_PLAYING;
  action: 'roles_assigned';
  myRole: string;
  partnerRole: string;
}

export interface RolePlayingMessageSent extends BaseGameMessage {
  gameType: typeof GameType.ROLE_PLAYING;
  action: 'message_sent';
  content: string;
  inCharacter: boolean;
}

export interface RolePlayingNewPrompt extends BaseGameMessage {
  gameType: typeof GameType.ROLE_PLAYING;
  action: 'new_prompt';
  prompt: string;
}

export interface TruthOrDareNewAction extends BaseGameMessage {
  gameType: typeof GameType.TRUTH_OR_DARE;
  action: 'new_action';
  actionData: {
    type: 'truth' | 'dare';
    content: string;
    difficulty: 'easy' | 'medium' | 'hard';
    category: 'relationship' | 'fun' | 'deep' | 'spicy';
  };
}

export interface TruthOrDareActionCompleted extends BaseGameMessage {
  gameType: typeof GameType.TRUTH_OR_DARE;
  action: 'action_completed';
  score: { truth: number; dare: number; };
  nextPlayer: string;
  turnRating?: Record<string, number>;
}

export interface TruthOrDareActionSkipped extends BaseGameMessage {
  gameType: typeof GameType.TRUTH_OR_DARE;
  action: 'action_skipped';
  nextPlayer: string;
}

export interface TwentyQuestionsWordSet extends BaseGameMessage {
  gameType: typeof GameType.TWENTY_QUESTIONS;
  action: 'word_set';
}

export interface TwentyQuestionsQuestionAsked extends BaseGameMessage {
  gameType: typeof GameType.TWENTY_QUESTIONS;
  action: 'question_asked';
  question: string;
}

export interface TwentyQuestionsQuestionAnswered extends BaseGameMessage {
  gameType: typeof GameType.TWENTY_QUESTIONS;
  action: 'question_answered';
  questionId: string;
  answer: 'yes' | 'no';
}

export interface TwentyQuestionsFinalGuess extends BaseGameMessage {
  gameType: typeof GameType.TWENTY_QUESTIONS;
  action: 'final_guess';
  guess: string;
}

export interface TwentyQuestionsGuessResult extends BaseGameMessage {
  gameType: typeof GameType.TWENTY_QUESTIONS;
  action: 'guess_result';
  correct: boolean;
  guesser: string;
}

export interface PartnerJoinedMessage extends BaseGameMessage {
  action: 'partner_joined';
}

export type PartnerQuizMessage = 
  | PartnerQuizRoundStarted 
  | PartnerQuizAnswersSubmitted 
  | PartnerQuizGuessesSubmitted 
  | PartnerJoinedMessage;

export type RolePlayingMessage = 
  | RolePlayingScenarioSelected 
  | RolePlayingRolesAssigned 
  | RolePlayingMessageSent 
  | RolePlayingNewPrompt 
  | PartnerJoinedMessage;

export type TruthOrDareMessage = 
  | TruthOrDareNewAction 
  | TruthOrDareActionCompleted 
  | TruthOrDareActionSkipped 
  | PartnerJoinedMessage;

export type TwentyQuestionsMessage = 
  | TwentyQuestionsWordSet 
  | TwentyQuestionsQuestionAsked 
  | TwentyQuestionsQuestionAnswered 
  | TwentyQuestionsFinalGuess 
  | TwentyQuestionsGuessResult 
  | PartnerJoinedMessage;

export type GameMessage = 
  | PartnerQuizMessage 
  | RolePlayingMessage 
  | TruthOrDareMessage 
  | TwentyQuestionsMessage;
