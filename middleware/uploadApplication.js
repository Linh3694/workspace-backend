const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Cấu hình Multer cho nhiều trường với folder khác nhau
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let dir;
        if (file.fieldname === "cvFile") {
            dir = path.join("uploads/CV");
        } else if (file.fieldname === "profilePicture") {
            dir = path.join("uploads/Profile");
        } else {
            return cb(new Error("Invalid field name"));
        }
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(
            null,
            file.fieldname + "-" + Date.now() + path.extname(file.originalname)
        );
    },
});

const uploadApplication = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit cho mỗi file
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    },
});

function checkFileType(file, cb) {
    if (file.fieldname === "profilePicture") {
        // Chỉ cho phép ảnh
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            return cb("Error: Only image files allowed for profilePicture!");
        }
    } else if (file.fieldname === "cvFile") {
        // Chỉ cho phép pdf, doc, docx
        const filetypes = /pdf|doc|docx/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype) || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.mimetype === 'application/msword';
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            return cb("Error: Only PDF, DOC, DOCX files allowed for cvFile!");
        }
    } else {
        return cb("Error: Unexpected field!");
    }
}

module.exports = uploadApplication;
