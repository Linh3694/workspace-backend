const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục uploads/Avatar tồn tại
const uploadPath = path.join(__dirname, "../uploads/Avatar");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Chuẩn hóa tên file, loại bỏ dấu tiếng Việt
    const sanitized = file.originalname
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (file.fieldname === "avatars") {
      // Upload hàng loạt: lấy phần sau dấu _ (mã nhân viên)
      const parts = sanitized.split("_");
      const lastPart = parts[parts.length - 1] || sanitized;
      cb(null, lastPart.trim());
    } else {
      cb(null, `${Date.now()}-${sanitized}`);
    }
  },
});

const uploadAvatar = multer({ storage });

module.exports = uploadAvatar;
