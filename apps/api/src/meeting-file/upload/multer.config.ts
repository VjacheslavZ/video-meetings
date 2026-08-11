import { randomUUID } from 'crypto';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
} from './upload.constants';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export const multerOptions: MulterOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, _file, cb) => {
      cb(null, randomUUID());
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_REQUEST,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(
        new BadRequestException(`File type not allowed: ${file.mimetype}`),
        false,
      );
      return;
    }
    cb(null, true);
  },
};
