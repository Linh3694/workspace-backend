// middleware/excelUpload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Lưu file vào thư mục tạm "uploads/excelTmp/"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/excelTmp/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname); // .xlsx, .xls, .csv
    const fileName = file.fieldname + "-" + Date.now() + ext;
    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  // Chấp nhận .xlsx, .xls, .csv
  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.mimetype === "text/csv"
  ) {
    cb(null, true);
  } else {
    cb(new Error("File phải là Excel (.xlsx/.xls) hoặc CSV"), false);
  }
};

const uploadExcel = multer({ storage, fileFilter });

module.exports = uploadExcel;