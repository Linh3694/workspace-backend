const express = require('express');
const router = express.Router();
const attendanceController = require('../../controllers/SIS/attendanceController');
const { authenticateToken } = require('../../middleware/auth');

// ✅ THÊM: Routes mới cho điểm danh theo tiết học
router.get('/periods/:classId/:schoolYearId', authenticateToken, attendanceController.getPeriodsByClass);
router.get('/timetable-slots/:classId/:date', authenticateToken, attendanceController.getTimetableSlotsByDate);
router.get('/subjects/:classId/:date', authenticateToken, attendanceController.getSubjectsByClassAndDate);
router.get('/by-class-date-subject/:classId/:date/:subjectId', authenticateToken, attendanceController.getAttendancesByClassDateSubject);
router.post('/period', authenticateToken, attendanceController.createPeriodAttendance);

// ✅ THÊM: Route lấy attendance theo student và date
router.get('/student/:studentId/:date', authenticateToken, attendanceController.getAttendancesByStudentAndDate);

// Define routes for Attendances
router.get('/', authenticateToken, attendanceController.getAttendances);
router.get('/classes-by-role', authenticateToken, attendanceController.getClassesByRole);
router.get('/students-by-class', authenticateToken, attendanceController.getStudentsByClass);
router.get('/time-attendance-by-date', authenticateToken, attendanceController.getTimeAttendanceByDate);
router.get('/:id', authenticateToken, attendanceController.getAttendanceById);
router.post('/', authenticateToken, attendanceController.createAttendance);
router.put('/:id', authenticateToken, attendanceController.updateAttendance);
router.delete('/:id', authenticateToken, attendanceController.deleteAttendance);

module.exports = router;