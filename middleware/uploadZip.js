// middleware/uploadZip.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/zipTmp/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Lưu đuôi .zip
    const ext = path.extname(file.originalname); // ".zip"
    const fileName = file.fieldname + "-" + Date.now() + ext; 
    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  // Chỉ cho phép .zip
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".zip") {
    cb(null, true);
  } else {
    cb(new Error("File phải là .zip"), false);
  }
};

const uploadZip = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 4096 * 1024 * 1024 } // 4GB
});

module.exports = uploadZip;