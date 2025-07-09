const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục `/uploads/Excel` tồn tại
const uploadPath = path.join(__dirname, "../uploads/Excel");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    
    cb(null, `excel-${timestamp}-${name}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Kiểm tra file Excel
  const allowedTypes = /xlsx|xls/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                   file.mimetype === 'application/vnd.ms-excel' ||
                   file.mimetype === 'application/octet-stream';

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file Excel (.xlsx, .xls)"), false);
  }
};

const uploadExcel = multer({ 
  storage,
  fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB cho file Excel
  }
});

module.exports = uploadExcel; 