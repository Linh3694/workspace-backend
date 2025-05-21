const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Đường dẫn thư mục upload cho Library
const uploadDir = "uploads/Library";

// Kiểm tra và tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Sử dụng memoryStorage để lấy buffer của file
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error("Chỉ cho phép upload ảnh (jpeg, jpg, png, gif)"));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// Hàm convert ảnh từ buffer sang định dạng WebP và lưu vào thư mục uploads/Library
const convertToWebp = async (buffer, originalName) => {
  const fileNameWithoutExt = path.parse(originalName).name;
  const fileName = `${Date.now()}-${fileNameWithoutExt}.webp`;
  const filePath = path.join(uploadDir, fileName);
  await sharp(buffer)
    .webp({ quality: 80 })
    .toFile(filePath);
  return filePath;
};

module.exports = { upload, convertToWebp };