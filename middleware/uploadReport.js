const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục /uploads/Events tồn tại
const uploadPath = path.join(__dirname, "../uploads/reports");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Cấu hình Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath); // Đặt thư mục đích là uploads/Events
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Tạo tên file duy nhất
  },
});

const upload = multer({ storage });

module.exports = upload;