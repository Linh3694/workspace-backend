const express = require("express");
const router = express.Router();
const classController = require("../../controllers/SIS/classController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");
const uploadClass = require("../../middleware/uploadClass");
const uploadExcel = require("../../middleware/uploadExcel");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Route: Lấy tất cả lớp học
router.get("/", classController.getAllClasses);

// Route: Tạo lớp học mới
router.post("/", isAdmin, classController.createClass);

router.post("/bulk-upload", isAdmin, uploadExcel.single("excelFile"), classController.bulkUploadClasses);

// Route: Lấy lớp học theo ID
router.get("/:id", classController.getClassById);

// Route: Cập nhật lớp học
router.put("/:id", isAdmin, classController.updateClass);

// Route: Xóa lớp học
router.delete("/:id", isAdmin, classController.deleteClass);

// Route: Upload ảnh cho lớp học (đơn lẻ)
router.post("/:id/upload-image", isAdmin, uploadClass.single("classImage"), classController.uploadClassImage);

// Route: Upload hàng loạt ảnh lớp từ ZIP
router.post("/bulk-upload-images", isAdmin, uploadClass.single("zipFile"), classController.bulkUploadClassImages);

module.exports = router;