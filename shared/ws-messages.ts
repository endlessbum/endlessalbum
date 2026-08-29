export const GameType = {
  TRUTH_OR_DARE: 'truth_or_dare',
  TWENTY_QUESTIONS: 'twenty_questions',
  PARTNER_QUIZ: 'partner_quiz',
  ROLE_PLAYING: 'role_playing',
} as const;

export const gameTypeValues = [
  GameType.TRUTH_OR_DARE,
  GameType.TWENTY_QUESTIONS,
  GameType.PARTNER_QUIZ,
  GameType.ROLE_PLAYING,
] as const;

export type GameType = (typeof gameTypeValues)[number];

// Дискриминирующий союз входящих WS-сообщений от клиента. Сервер ВСЕГДА
// перевалидирует каждое из них своей zod-схемой (wsChatMessageSchema,
// wsGameActionSchema), поэтому здесь типы отражают форму "до валидации":
// поля, которыми злоумышленник может подменить данные, не обязаны быть
// корректными. type — единственное поле, которому доверяем для диспетчеризации.
export type WsIncomingMessage =
  | {
      type: 'chat_message';
      content?: unknown;
      mediaUrl?: unknown;
      mediaType?: unknown;
      isEphemeral?: unknown;
    }
  | {
      type: 'game_action';
      gameType?: unknown;
      gameId?: unknown;
      action?: unknown;
      data?: unknown;
      senderId?: unknown;
    }
  | {
      type: 'game_invitation';
      gameType?: unknown;
      gameTitle?: unknown;
      message?: unknown;
    }
  | { type: 'typing_start' }
  | { type: 'typing_stop' }
  | { type: 'presence_ping' };

