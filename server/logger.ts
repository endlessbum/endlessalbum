export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const parseLogLevel = (value: string | undefined): LogLevel => {
  if (!value) return LogLevel.INFO;
  const normalized = value.toUpperCase() as keyof typeof LogLevel;
  const parsed = LogLevel[normalized];
  return typeof parsed === 'number' ? parsed : LogLevel.INFO;
};

const currentLevel = parseLogLevel(process.env.LOG_LEVEL);

const formatTimestamp = (): string => {
  return new Date().toISOString();
};

const formatMessage = (level: keyof typeof LogLevel, context: string, message: string, data?: unknown): string => {
  const timestamp = formatTimestamp();
  const levelStr = level.padEnd(5);
  const contextStr = `[${context}]`.padEnd(15);
  
  let logLine = `${timestamp} ${levelStr} ${contextStr} ${message}`;
  
  if (data !== undefined) {
    if (data instanceof Error) {
      logLine += `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
    } else {
      try {
        logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`;
      } catch {
        logLine += `\n  Data: [Unable to stringify]`;
      }
    }
  }
  
  return logLine;
};

const shouldLog = (level: LogLevel): boolean => {
  return level >= currentLevel;
};

export const logger = {
  debug: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.DEBUG)) {
      console.debug(formatMessage('DEBUG', context, message, data));
    }
  },
  
  info: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.INFO)) {
      console.info(formatMessage('INFO', context, message, data));
    }
  },
  
  warn: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.WARN)) {
      console.warn(formatMessage('WARN', context, message, data));
    }
  },
  
  error: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.ERROR)) {
      console.error(formatMessage('ERROR', context, message, data));
    }
  },
};

export const log = {
  debug: logger.debug,
  info: logger.info,
  warn: logger.warn,
  error: logger.error,
  trace: (context: string, message: string, data?: unknown) => logger.debug(context, message, data),
};

export const LogContext = {
  SERVER: 'SERVER',
  AUTH: 'AUTH',
  WS: 'WS',
  DB: 'DB',
  ROUTES: 'ROUTES',
  UPLOAD: 'UPLOAD',
  STORAGE: 'STORAGE',
  GAME: 'GAME',
  SESSION: 'SESSION',
  HEARTBEAT: 'HEARTBEAT',
  CORS: 'CORS',
  VALIDATION: 'VALIDATION',
  RATE_LIMIT: 'RATE_LIMIT',
} as const;

export type LogContext = typeof LogContext[keyof typeof LogContext];
