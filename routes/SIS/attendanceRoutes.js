const express = require('express');
const router = express.Router();
const attendanceController = require('../../controllers/SIS/attendanceController');

// Define routes for Attendances
router.get('/', attendanceController.getAttendances);
router.get('/classes-by-role', attendanceController.getClassesByRole);
router.get('/students-by-class', attendanceController.getStudentsByClass);
router.get('/:id', attendanceController.getAttendanceById);
router.post('/', attendanceController.createAttendance);
router.put('/:id', attendanceController.updateAttendance);
router.delete('/:id', attendanceController.deleteAttendance);

module.exports = router;