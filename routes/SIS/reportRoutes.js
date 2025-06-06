const express = require('express');
const router = express.Router();
const reportController = require('../../controllers/SIS/reportController');

// Routes cho báo cáo và bảng điểm
router.get('/', reportController.getReports);
router.get('/student', reportController.getStudentReport);
router.get('/:id', reportController.getReportById);
router.post('/', reportController.createReport);
router.put('/:id', reportController.updateReport);
router.delete('/:id', reportController.deleteReport);

module.exports = router; 