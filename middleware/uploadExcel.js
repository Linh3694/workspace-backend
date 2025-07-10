const multer = require("multer");
const path = require("path");

// Sử dụng memoryStorage để file được lưu trong buffer
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Kiểm tra file Excel nhé
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