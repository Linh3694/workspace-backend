const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục /uploads/Chat tồn tại
const uploadDir = path.join(__dirname, '../uploads/Chat');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const cleanName = file.originalname
      .normalize('NFD')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, uniqueSuffix + '-' + cleanName);
  },
});

const allowedTypes = [
  'image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'text/plain'
];

const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload ảnh hoặc file tài liệu (pdf, doc, docx, xlsx, zip, txt, png, jpg, jpeg, gif, webp)!'), false);
  }
};

const uploadChat = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

module.exports = uploadChat; 