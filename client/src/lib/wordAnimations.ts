export type AnimationKey = 'pulse' | 'attract' | 'bounce' | 'message-float' | 'blush';

export type WordAnimation = { word: string; animation: AnimationKey };

export const AVAILABLE_ANIMATIONS: { key: AnimationKey; label: string; className: string }[] = [
  { key: 'pulse', label: 'Пульсация', className: 'animate-pulse text-primary font-semibold' },
  { key: 'attract', label: 'Притяжение', className: 'word-attract text-primary font-semibold' },
  { key: 'bounce', label: 'Подпрыгивание', className: 'animate-bounce text-primary font-semibold' },
  { key: 'message-float', label: 'Плавное всплытие', className: 'animate-message-float text-primary font-semibold' },
  { key: 'blush', label: 'Покраснение', className: 'text-text-primary font-semibold' },
];

export const DEFAULT_WORD_ANIMATIONS: WordAnimation[] = [
  { word: 'люблю', animation: 'pulse' },
  { word: 'любовь', animation: 'attract' },
  { word: 'обожаю', animation: 'pulse' },
  { word: 'скучаю', animation: 'message-float' },
  { word: 'целую', animation: 'bounce' },
  { word: 'love', animation: 'pulse' },
];

export function getAnimationClass(key: AnimationKey): string {
  return AVAILABLE_ANIMATIONS.find(a => a.key === key)?.className || '';
}
