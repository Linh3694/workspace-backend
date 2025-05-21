// uploadAvatar.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục `/uploads/Avatar` tồn tại
const uploadPath = path.join(__dirname, "../uploads/Avatar");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // 1. Normalize để chuyển sang dạng Unicode chuẩn
    // 2. Loại bỏ dấu (diacritics) bằng regex
    let sanitized = file.originalname
      .normalize("NFD")                    // Tách tổ hợp ký tự
      .replace(/[\u0300-\u036f]/g, "");    // Xoá dấu

    if (file.fieldname === "avatars") {
      // Trường hợp upload hàng loạt (bulk)
      // Tách chuỗi bằng ký tự '_' => lấy phần cuối
      // Ví dụ: "Bùi Quỳnh Mai+_WT02GO.jpeg" => ["Bui Quynh Mai+", "WT02GO.jpeg"]
      const parts = sanitized.split("_");
      const lastPart = parts[parts.length - 1] || sanitized;
      cb(null, lastPart.trim());
    } else {
      // Trường hợp upload đơn lẻ
      cb(null, `${Date.now()}-${sanitized}`);
    }
  },
});

const upload = multer({ storage });
module.exports = upload;