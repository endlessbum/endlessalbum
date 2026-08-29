export type SanitizedUser<T extends { password: unknown }> = Omit<T, 'password'>;

export function sanitizeUser<T extends { password: unknown }>(user: T): SanitizedUser<T> {
  const { password: _password, ...sanitizedUser } = user;
  return sanitizedUser;
}

// Человекочитаемый лимит размера файла для сообщений о загрузке. Все лимиты в
// проекте (shared/constants.ts) кратны мегабайту, поэтому показываем целое
// число + «МБ». Используется и на сервере, и на клиенте, чтобы тексты о лимитах
// всегда совпадали с реально применяемыми значениями.
export function formatMaxSizeMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

