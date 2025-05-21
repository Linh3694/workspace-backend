const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục /uploads/Events tồn tại
const uploadPath = path.join(__dirname, "../uploads/Events");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Cấu hình Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

module.exports = upload;