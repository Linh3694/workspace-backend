const express = require("express");
const router = express.Router();
const subjectController = require("../../controllers/SIS/subjectController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Route: Lấy tất cả môn học
router.get("/", subjectController.getAllSubjects);

// Route: Lấy danh sách môn học cha
router.get("/parent", subjectController.getParentSubjects);

// Route: Bulk upload subjects
router.post("/bulk-upload", isAdmin, subjectController.bulkUploadSubjects);

// Route: Tạo môn học mới
router.post("/", isAdmin, subjectController.createSubject);

// Route: Lấy môn học con của một môn học cha
router.get("/:parentId/sub-subjects", subjectController.getSubSubjects);

// Route: Lấy môn học theo ID
router.get("/:id", subjectController.getSubjectById);

// Route: Cập nhật môn học
router.put("/:id", isAdmin, subjectController.updateSubject);

// Route: Xóa môn học
router.delete("/:id", isAdmin, subjectController.deleteSubject);

module.exports = router;