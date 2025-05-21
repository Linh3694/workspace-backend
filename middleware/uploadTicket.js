const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Định nghĩa đường dẫn thư mục upload
const uploadDir = "uploads/Tickets";

// Kiểm tra và tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình storage để lưu file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Lưu file vào thư mục đã kiểm tra
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

// Chỉ cho phép upload ảnh (png, jpg, jpeg, heic)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|heic/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file ảnh (png, jpg, jpeg, heic)"));
  }
};

// Cấu hình upload: tối đa 5 file, mỗi file 5MB
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// 🛑 KIỂM TRA XUẤT MODULE
module.exports = upload;