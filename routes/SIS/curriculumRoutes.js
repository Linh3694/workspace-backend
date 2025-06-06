const express = require("express");
const router = express.Router();
const curriculumController = require("../../controllers/SIS/curriculumController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Route: Lấy tất cả chương trình học
router.get("/", curriculumController.getAllCurriculums);

// Route: Tạo chương trình học mới
router.post("/", isAdmin, curriculumController.createCurriculum);

// Route: Lấy chương trình học theo ID
router.get("/:id", curriculumController.getCurriculumById);

// Route: Cập nhật chương trình học
router.put("/:id", isAdmin, curriculumController.updateCurriculum);

// Route: Xóa chương trình học
router.delete("/:id", isAdmin, curriculumController.deleteCurriculum);

// Route: Thêm môn học vào chương trình học
router.post("/:id/subjects", isAdmin, curriculumController.addSubject);


// Route: Xóa môn học khỏi chương trình học
router.delete("/:id/subjects/:subjectId", isAdmin, curriculumController.removeSubject);

module.exports = router;