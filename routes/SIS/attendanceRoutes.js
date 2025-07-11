const express = require('express');
const router = express.Router();
const attendanceController = require('../../controllers/SIS/attendanceController');

// ✅ THÊM: Routes mới cho điểm danh theo tiết học
router.get('/periods/:classId/:schoolYearId', attendanceController.getPeriodsByClass);
router.get('/timetable-slots/:classId/:date', attendanceController.getTimetableSlotsByDate);
router.get('/subjects/:classId/:date', attendanceController.getSubjectsByClassAndDate);
router.get('/by-class-date-subject/:classId/:date/:subjectId', attendanceController.getAttendancesByClassDateSubject);
router.post('/period', attendanceController.createPeriodAttendance);

// Define routes for Attendances
router.get('/', attendanceController.getAttendances);
router.get('/classes-by-role', attendanceController.getClassesByRole);
router.get('/students-by-class', attendanceController.getStudentsByClass);
router.get('/time-attendance-by-date', attendanceController.getTimeAttendanceByDate);
router.get('/:id', attendanceController.getAttendanceById);
router.post('/', attendanceController.createAttendance);
router.put('/:id', attendanceController.updateAttendance);
router.delete('/:id', attendanceController.deleteAttendance);

module.exports = router;