const express = require("express");
const router = express.Router();
const timetableScheduleController = require("../../controllers/SIS/timetableScheduleController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");
const uploadTimetable = require("../../middleware/uploadTimetable");

// Lấy tất cả thời khoá biểu theo lớp
router.get("/", authenticateToken, timetableScheduleController.getTimetableSchedules);

// Tạo thời khoá biểu mới (chỉ admin)
router.post("/", authenticateToken, isAdmin, timetableScheduleController.createTimetableSchedule);

// Cập nhật thời khoá biểu (chỉ admin)
router.put("/:id", authenticateToken, isAdmin, timetableScheduleController.updateTimetableSchedule);

// Xóa thời khoá biểu (chỉ admin)
router.delete("/:id", authenticateToken, isAdmin, timetableScheduleController.deleteTimetableSchedule);

// Lấy thời khoá biểu theo ID
router.get("/:id", authenticateToken, timetableScheduleController.getTimetableScheduleById);

// Upload file cho thời khoá biểu (chỉ admin)
router.post("/:id/upload", authenticateToken, isAdmin, uploadTimetable.single('file'), timetableScheduleController.uploadTimetableFile);

module.exports = router; 