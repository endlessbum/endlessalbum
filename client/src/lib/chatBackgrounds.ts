import type React from 'react';

export type ChatBackgroundKey =
  | 'none'
  | 'blue'
  | 'green'
  | 'peach'
  | 'pink'
  | 'lightGray'
  | 'dark';

export const CHAT_BACKGROUNDS: { key: ChatBackgroundKey; label: string }[] = [
  { key: 'none', label: 'Без фона' },
  { key: 'blue', label: 'Голубой' },
  { key: 'green', label: 'Зелёный' },
  { key: 'peach', label: 'Персиковый' },
  { key: 'pink', label: 'Розовый' },
  { key: 'lightGray', label: 'Светло‑серый' },
  { key: 'dark', label: 'Тёмный' },
];

export function getChatBackgroundStyle(key: ChatBackgroundKey): React.CSSProperties | undefined {
  switch (key) {
    case 'none':
      return undefined;
    default:
      return { background: '#000000' };
  }
}
