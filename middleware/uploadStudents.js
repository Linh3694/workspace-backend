// middleware/uploadMiddleware.js
const multer = require("multer");
const path = require("path");

// Cấu hình lưu file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Thư mục upload
    cb(null, "uploads/Students");
  },
  filename: (req, file, cb) => {
    // Tạo tên file duy nhất
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Lấy phần mở rộng (jpg, png...)
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({ storage });

module.exports = upload;