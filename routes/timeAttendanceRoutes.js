const express = require("express");
const router = express.Router();
const timeAttendanceController = require("../controllers/timeAttendanceController");
// const { authenticate } = require("../middleware/authMiddleware"); // Middleware xác thực nếu có

// Middleware để log requests (tùy chọn)
const logRequest = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
};

// Apply logging middleware cho tất cả routes
router.use(logRequest);

// Routes cho upload dữ liệu từ máy chấm công (không cần auth để máy chấm công có thể gửi)
/**
 * POST /api/attendance/upload
 * Upload batch dữ liệu chấm công từ máy chấm công HIKVISION
 * Body: { data: [{ fingerprintCode, dateTime, device_id }], tracker_id }
 */
router.post("/upload", timeAttendanceController.uploadAttendanceBatch);

// Routes cần authentication (cho admin/user interface)
// Uncomment dòng dưới nếu muốn bảo vệ các routes này
// router.use(authenticate);

/**
 * GET /api/attendance/records
 * Lấy danh sách records chấm công với filter và pagination
 * Query params: startDate, endDate, employeeCode, page, limit, sortBy, sortOrder
 */
router.get("/records", timeAttendanceController.getAttendanceRecords);

/**
 * GET /api/attendance/stats
 * Lấy thống kê tổng quan về dữ liệu chấm công
 * Query params: startDate, endDate, employeeCode
 */
router.get("/stats", timeAttendanceController.getAttendanceStats);

/**
 * GET /api/attendance/employee/:employeeCode
 * Lấy chi tiết chấm công của một nhân viên cụ thể
 * Params: employeeCode
 * Query params: startDate, endDate, includeRawData
 */
router.get("/employee/:employeeCode", timeAttendanceController.getEmployeeAttendance);

/**
 * PUT /api/attendance/record/:recordId/notes
 * Cập nhật ghi chú cho một record chấm công
 * Params: recordId
 * Body: { notes, status }
 */
router.put("/record/:recordId/notes", timeAttendanceController.updateAttendanceNotes);

/**
 * DELETE /api/attendance/records
 * Xóa dữ liệu chấm công theo điều kiện
 * Body: { startDate, endDate, employeeCode, confirmDelete: true }
 */
router.delete("/records", timeAttendanceController.deleteAttendanceRecords);

/**
 * POST /api/attendance/sync-users
 * Đồng bộ employeeCode với Users collection
 */
router.post("/sync-users", timeAttendanceController.syncWithUsers);

/**
 * POST /api/attendance/cleanup-raw-data
 * Cleanup rawData cũ hơn 7 ngày để tiết kiệm storage
 */
router.post("/cleanup-raw-data", timeAttendanceController.cleanupOldRawData);

// Health check endpoint
router.get("/health", (req, res) => {
    res.status(200).json({
        status: "success",
        message: "Time Attendance API is running",
        timestamp: new Date().toISOString()
    });
});

module.exports = router; 