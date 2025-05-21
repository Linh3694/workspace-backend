const multer = require('multer');
const path = require('path');

// Cấu hình lưu trữ
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Thư mục lưu file
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const cleanName = file.originalname
      .normalize("NFD") // Loại bỏ dấu tiếng Việt
      .replace(/[\u0300-\u036f]/g, "") // Loại bỏ các ký tự đặc biệt
      .replace(/[^a-zA-Z0-9.]/g, "_"); // Thay thế ký tự đặc biệt bằng "_"
    cb(null, `${file.fieldname}-${uniqueSuffix}-${cleanName}`);
  },
});

// Kiểm tra loại file
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and JPG files are allowed!'), false);
  }
};

// Middleware Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // Giới hạn file 2MB
});

module.exports = upload;