import path from "path";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  // Audio / video
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/webm",
  "video/mp4", "video/webm", "video/ogg",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  // Archives
  "application/zip", "application/x-rar-compressed", "application/x-7z-compressed",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
  }
};

export default {
  directory: publicFolder,

  storage: multer.diskStorage({
    destination: publicFolder,
    filename(_req, file, cb) {
      // Use only timestamp + original extension — never trust the original filename
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
      const fileName = `${new Date().getTime()}${ext}`;
      return cb(null, fileName);
    }
  }),

  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
};
