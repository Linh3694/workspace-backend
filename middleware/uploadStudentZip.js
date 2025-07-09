const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục `/uploads/Students` tồn tại
const uploadPath = path.join(__dirname, "../uploads/Students");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Đảm bảo thư mục temp cho ZIP tồn tại
const zipTempPath = path.join(__dirname, "../uploads/temp/zip");
if (!fs.existsSync(zipTempPath)) {
  fs.mkdirSync(zipTempPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "zipFile") {
      // ZIP file sẽ được lưu vào thư mục temp
      cb(null, zipTempPath);
    } else {
      // Ảnh đơn lẻ sẽ được lưu vào thư mục Students
      cb(null, uploadPath);
    }
  },
  filename: (req, file, cb) => {
    if (file.fieldname === "zipFile") {
      // ZIP file
      const timestamp = Date.now();
      cb(null, `student-images-${timestamp}.zip`);
    } else {
      // Ảnh đơn lẻ
      // Normalize để chuyển sang dạng Unicode chuẩn và loại bỏ dấu
      let sanitized = file.originalname
        .normalize("NFD")                    // Tách tổ hợp ký tự
        .replace(/[\u0300-\u036f]/g, "");    // Xoá dấu

      const timestamp = Date.now();
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext);
      
      cb(null, `student-${timestamp}-${name}${ext}`);
    }
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.fieldname === "zipFile") {
    // Kiểm tra file ZIP
    if (file.mimetype === "application/zip" || 
        file.mimetype === "application/x-zip-compressed" ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file ZIP"), false);
    }
  } else {
    // Kiểm tra ảnh
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file ảnh"), false);
    }
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { 
    fileSize: 4 * 1024 * 1024 * 1024 // 4GB cho ZIP, 5MB cho ảnh đơn lẻ
  }
});

module.exports = upload; 