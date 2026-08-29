import { Storage } from '@google-cloud/storage';
import { logger, LogContext } from './logger';

let storage: Storage | null = null;
let bucketName: string | null = null;

/**
 * Включён ли cloud-upload в Google Cloud Storage. GCS считается настроенным,
 * когда заданы оба параметра: GCS_BUCKET и GCS_KEYFILE (путь к файлу ключа
 * сервисного аккаунта). Без них всё продолжает работать на локальном диске.
 */
export const isGcsConfigured = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.GCS_BUCKET && env.GCS_KEYFILE);

const getStorage = (): { storage: Storage; bucketName: string } | null => {
  if (!isGcsConfigured()) return null;
  if (!storage || !bucketName) {
    storage = new Storage({
      keyFilename: process.env.GCS_KEYFILE,
    });
    bucketName = process.env.GCS_BUCKET!;
    logger.info(LogContext.UPLOAD, `GCS настроен: bucket "${bucketName}"`);
  }
  return { storage, bucketName };
};

/**
 * Загружает буфер в GCS-бакет и возвращает публичный URL. Если GCS не
 * настроен, возвращает null — вызывающий код должен сохранить файл локально.
 */
export const uploadToGcs = async (
  buffer: Buffer,
  destination: string,
  contentType: string,
): Promise<string | null> => {
  const gcs = getStorage();
  if (!gcs) return null;

  const file = gcs.storage.bucket(gcs.bucketName).file(destination);
  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  logger.info(LogContext.UPLOAD, `Загружено в GCS: ${destination}`);
  return `https://storage.googleapis.com/${gcs.bucketName}/${destination}`;
};
