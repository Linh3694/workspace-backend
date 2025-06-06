const express = require("express");
const router = express.Router();
const schoolController = require("../../controllers/SIS/schoolController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Route: Lấy tất cả trường học
router.get("/", schoolController.getSchools);

// Route: Tạo trường học mới
router.post("/", isAdmin, schoolController.createSchool);

// Route: Lấy trường học theo ID
router.get("/:id", schoolController.getSchoolById);

// Route: Cập nhật trường học
router.put("/:id", isAdmin, schoolController.updateSchool);

// Route: Xóa trường học
router.delete("/:id", isAdmin, schoolController.deleteSchool);

module.exports = router; 