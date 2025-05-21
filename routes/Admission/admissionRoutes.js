const express = require('express');
const router = express.Router();
const admissionController = require('../../controllers/Admission/admissionController');

// Lấy thống kê tuyển sinh
router.get('/stats', admissionController.getLatestAdmissionStats);

// Cập nhật số học sinh mới 
router.put('/new-students', admissionController.updateNewStudents);

// Cập nhật số học sinh tái ghi danh
router.put('/returning-students', admissionController.updateReturningStudents);

// Tăng số học sinh mới thêm 1
router.post('/increment-new', admissionController.incrementNewStudents);

// Tăng số học sinh tái ghi danh thêm 1
router.post('/increment-returning', admissionController.incrementReturningStudents);

// Thiết lập lại toàn bộ thống kê
router.post('/reset', admissionController.resetAdmissionStats);

module.exports = router;
