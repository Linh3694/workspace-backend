const multer = require("multer");
const path = require("path");
const fs = require("fs");


// Định nghĩa nơi lưu file và tên file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/Document";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Đổi tên file để tránh trùng
    const ext = path.extname(file.originalname);
    const fileName = Date.now() + "_" + file.originalname;
    cb(null, fileName);
  },
});

// Khởi tạo middleware
const uploadDocument = multer({ storage });

module.exports = { uploadDocument };