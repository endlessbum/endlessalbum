import multer from 'multer';
import path from 'path';

import fsSync from 'fs';
import {
  AVATAR_MAX_SIZE,
  MEMORY_IMAGE_MAX_SIZE,
  MEMORY_VIDEO_MAX_SIZE,
  AUDIO_MAX_SIZE,
  VOICE_MESSAGE_MAX_SIZE,
  DOCUMENT_MAX_SIZE,
} from '@shared/constants';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'];

export const DOCUMENT_MIME_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export const imageFileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, HEIC)'));
  }
};

export const videoFileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed (MP4, WebM, MOV, AVI)'));
  }
};

export const audioFileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (AUDIO_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed (MP3, OGG, WAV, WebM, AAC)'));
  }
};

export const documentFileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only document files are allowed (PDF, DOC, DOCX)'));
  }
};

export const memoryStorage = multer.memoryStorage();

export const createDiskStorage = (subDir: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', subDir);
    fsSync.mkdir(uploadsDir, { recursive: true }, (err) => cb(err || null, uploadsDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

export const avatarUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: AVATAR_MAX_SIZE },
  fileFilter: imageFileFilter,
});

export const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MEMORY_IMAGE_MAX_SIZE },
  fileFilter: imageFileFilter,
});

export const videoUpload = multer({
  storage: createDiskStorage('memories'),
  limits: { fileSize: MEMORY_VIDEO_MAX_SIZE },
  fileFilter: videoFileFilter,
});

export const audioUpload = multer({
  storage: createDiskStorage('audios'),
  limits: { fileSize: AUDIO_MAX_SIZE },
  fileFilter: audioFileFilter,
});

export const audioCoverUpload = multer({
  storage: createDiskStorage('audios/covers'),
  limits: { fileSize: MEMORY_IMAGE_MAX_SIZE },
  fileFilter: imageFileFilter,
});

export const documentUpload = multer({
  storage: createDiskStorage('documents'),
  limits: { fileSize: DOCUMENT_MAX_SIZE },
  fileFilter: documentFileFilter,
});

export const voiceMessageUpload = multer({
  storage: createDiskStorage('voice'),
  limits: { fileSize: VOICE_MESSAGE_MAX_SIZE },
  fileFilter: audioFileFilter,
});
