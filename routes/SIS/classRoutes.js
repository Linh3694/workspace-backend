const express = require("express");
const router = express.Router();
const classController = require("../../controllers/SIS/classController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Route: Lấy tất cả lớp học
router.get("/", classController.getAllClasses);

// Route: Tạo lớp học mới
router.post("/", isAdmin, classController.createClass);

router.post("/bulk-upload", isAdmin, classController.bulkUploadClasses);

// Route: Lấy lớp học theo ID
router.get("/:id", classController.getClassById);

// Route: Cập nhật lớp học
router.put("/:id", isAdmin, classController.updateClass);

// Route: Xóa lớp học
router.delete("/:id", isAdmin, classController.deleteClass);

module.exports = router;