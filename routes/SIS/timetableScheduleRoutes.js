const express = require("express");
const router = express.Router();
const timetableScheduleController = require("../../controllers/SIS/timetableScheduleController");
const { isAdmin, isTeacher, isParent } = require("../../middleware/authMiddleware");
const uploadTimetable = require("../../middleware/uploadTimetable");

// Lấy tất cả thời khoá biểu theo lớp
router.get("/", timetableScheduleController.getTimetableSchedules);

// Tạo thời khoá biểu mới (chỉ admin và teacher)
router.post("/", isAdmin, timetableScheduleController.createTimetableSchedule);

// Cập nhật thời khoá biểu (chỉ admin và teacher)
router.put("/:id", isAdmin, timetableScheduleController.updateTimetableSchedule);

// Xóa thời khoá biểu (chỉ admin)
router.delete("/:id", isAdmin, timetableScheduleController.deleteTimetableSchedule);

// Lấy thời khoá biểu theo ID
router.get("/:id", timetableScheduleController.getTimetableScheduleById);

// Upload file cho thời khoá biểu (chỉ admin và teacher)
router.post("/:id/upload", isAdmin, uploadTimetable.single('file'), timetableScheduleController.uploadTimetableFile);

module.exports = router; 