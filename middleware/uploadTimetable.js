const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục uploads/Timetables tồn tại
const uploadPath = path.join(__dirname, "../uploads/Timetables");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Cấu hình storage cho multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Tạo tên file unique với timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `timetable-${uniqueSuffix}${ext}`);
  }
});

// Filter để chỉ chấp nhận file Excel
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/octet-stream' // Một số trường hợp .xlsx có thể có content-type này
  ];
  
  const allowedExtensions = ['.xlsx', '.xls'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'), false);
  }
};

// Cấu hình multer
const uploadTimetable = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  }
});

module.exports = uploadTimetable; 