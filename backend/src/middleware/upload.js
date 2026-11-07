// Safe CSV upload handling with multer.
//  - The file is saved under a random name we choose; the user's file name is never used as a path.
//  - Size is limited while the file arrives (not after).
//  - Only one file, in the field called "file".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const HttpError = require('../utils/httpError');
const { isBusy } = require('../services/detectionService');

const ALLOWED_MIME = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel', // Windows often labels CSV files like this
  'application/octet-stream',
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
      cb(null, config.uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    cb(null, `${crypto.randomUUID()}.csv`);
  },
});

const uploader = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, cb) {
    const extensionOk = path.extname(file.originalname || '').toLowerCase() === '.csv';
    // The MIME type comes from the browser and can be faked, so it is only a first filter.
    // The real checks (text content, header, rows) happen after the file is saved.
    if (!extensionOk || !ALLOWED_MIME.has(String(file.mimetype).toLowerCase())) {
      return cb(new HttpError(400, 'Only .csv files are accepted'));
    }
    return cb(null, true);
  },
});

function uploadCsv(req, res, next) {
  // Refuse before reading the body if the server is already busy, so no disk space is used.
  if (isBusy()) {
    return next(new HttpError(429, 'The server is busy analysing other files. Please try again in a minute.'));
  }
  return uploader.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(413, `File is too large. The limit is ${config.maxUploadMb} MB.`));
      }
      return next(new HttpError(400, 'Upload rejected: send exactly one file in the "file" field and no other fields.'));
    }
    return next(err);
  });
}

module.exports = { uploadCsv };
