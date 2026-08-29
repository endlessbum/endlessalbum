import { describe, it, expect } from 'vitest';
import {
  AVATAR_MAX_SIZE,
  MEMORY_IMAGE_MAX_SIZE,
  MEMORY_VIDEO_MAX_SIZE,
  VOICE_MESSAGE_MAX_SIZE,
  AUDIO_MAX_SIZE,
  DOCUMENT_MAX_SIZE,
} from '@shared/constants';
import { formatMaxSizeMb } from '@shared/utils';

describe('formatMaxSizeMb', () => {
  it('formats byte limits as whole megabytes with a Russian unit', () => {
    expect(formatMaxSizeMb(5 * 1024 * 1024)).toBe('5 МБ');
    expect(formatMaxSizeMb(20 * 1024 * 1024)).toBe('20 МБ');
    expect(formatMaxSizeMb(100 * 1024 * 1024)).toBe('100 МБ');
  });

  it('rounds to the nearest megabyte', () => {
    expect(formatMaxSizeMb(1.5 * 1024 * 1024)).toBe('2 МБ');
  });
});

describe('shared upload limits (единый источник правды)', () => {
  // Все лимиты импортируются и сервером (multer + тексты ошибок), и клиентом
  // (проверки + подписи). Здесь фиксируем инвариант: каждый лимит — целое число
  // мегабайт, иначе formatMaxSizeMb округлит и текст соврёт о реальном лимите.
  it('every limit is a positive whole number of megabytes', () => {
    const limits = {
      AVATAR_MAX_SIZE,
      MEMORY_IMAGE_MAX_SIZE,
      MEMORY_VIDEO_MAX_SIZE,
      VOICE_MESSAGE_MAX_SIZE,
      AUDIO_MAX_SIZE,
      DOCUMENT_MAX_SIZE,
    };
    for (const [name, bytes] of Object.entries(limits)) {
      expect(bytes, name).toBeGreaterThan(0);
      expect(bytes % (1024 * 1024), name).toBe(0);
    }
  });
});
