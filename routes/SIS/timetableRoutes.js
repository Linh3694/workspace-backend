const express = require("express");
const router = express.Router();
const timetableController = require("../../controllers/SIS/timetableController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Lấy tất cả thời khóa biểu
router.get("/", timetableController.getAllTimetables);

// Tạo thời khóa biểu mới
router.post("/", isAdmin, timetableController.createTimetable);

// Lấy thời khóa biểu theo lớp
router.get("/class/:classId", timetableController.getTimetableByClass);

// Tạo thời khóa biểu tự động cho lớp
router.post("/generate/:schoolYearId/:classId", timetableController.generateTimetable);

// Tạo thời khóa biểu tự động cho toàn trường
router.post("/generate-school/:schoolYearId/:schoolId", timetableController.generateTimetableForSchool);

// Lấy thời khóa biểu dạng lưới cho lớp
router.get("/grid/:schoolYearId/:classId", timetableController.getTimetableGridByClass);

// Lấy lịch dạy của giáo viên
router.get("/teachers/:teacherId/timetable", timetableController.getTeacherTimetable);

// Lấy thời khóa biểu của giáo viên
router.get("/teacher/:teacherId/:schoolYearId", timetableController.getTeacherTimetable);


// Lấy tất cả các định nghĩa khoá học cho một năm học
router.get("/period-definitions/:schoolYearId", timetableController.getPeriodDefinitions);

// CRUD cho Period Definition
router.post("/period-definitions/:schoolYearId", isAdmin, timetableController.createPeriodDefinition);

router.put("/period-definitions/:id", isAdmin, timetableController.updatePeriodDefinition);

router.delete("/period-definitions/:id", isAdmin, timetableController.deletePeriodDefinition);

// Bulk import timetable from Excel
router.post("/import", isAdmin, timetableController.importTimetable);

router.get("/teachers", timetableController.getTeachersByClassSubject);

// Debug endpoint to check timetable status
router.get("/debug/:classId", timetableController.debugTimetableStatus);

// Lấy thời khóa biểu theo ID
router.get("/:id", timetableController.getTimetableById);

// Cập nhật thời khóa biểu
router.put("/:id", isAdmin, timetableController.updateTimetable);

// Xóa thời khóa biểu
router.delete("/:id", isAdmin, timetableController.deleteTimetable);

module.exports = router;