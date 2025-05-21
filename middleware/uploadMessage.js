// middleware/uploadMessage.js (ví dụ)
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục uploads/Messages tồn tại
const messagesDir = path.join(__dirname, "../uploads/Messages");
if (!fs.existsSync(messagesDir)) {
  fs.mkdirSync(messagesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/Messages"); // thư mục lưu file
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadMessage = multer({ storage });

module.exports = uploadMessage;