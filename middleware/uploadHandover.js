const multer = require("multer");
const path = require("path");
const fs = require("fs");
const moment = require("moment");

// Đảm bảo thư mục /uploads/Handovers tồn tại
const uploadPath = path.join(__dirname, "../uploads/Handovers");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Cấu hình Multer để lưu file vào bộ nhớ tạm
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }); // Đây là phần quan trọng

const processFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "Không có file được tải lên!" });
  }

  // Lấy thông tin username từ body
  const username = req.body.username || "Unknown";
  const formattedDate = moment().format("YYYY-MM-DD");
  const fileExtension = path.extname(req.file.originalname);
  const newFileName = `BBBG-${username}-${formattedDate}${fileExtension}`;

  // Lưu file vào thư mục `uploads/Handovers`
  const filePath = path.join(uploadPath, newFileName);
  fs.writeFileSync(filePath, req.file.buffer);

  console.log("✅ File đã lưu:", filePath);

  // Gán đường dẫn file vào `req.file.path` để controller có thể sử dụng
  req.file.path = `/uploads/Handovers/${newFileName}`;
  next();
};

// Xuất đúng instance của multer để sử dụng trong router
module.exports = { upload, processFile };