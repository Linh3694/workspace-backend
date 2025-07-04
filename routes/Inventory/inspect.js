const express = require('express');
const inspectController = require('../../controllers/Inventory/inspectController');
const { authenticateToken } = require('../../middleware/auth');
const router = express.Router();
const uploadReport = require("../../middleware/uploadReport");


router.get('/', inspectController.getAllInspections); // Lấy danh sách kiểm tra
router.get('/:id', inspectController.getInspectionById); // Lấy chi tiết kiểm tra
router.put('/:id', inspectController.updateInspection);
router.post('/', authenticateToken, inspectController.createInspection); // Tạo bản ghi kiểm tra
router.delete('/:id', inspectController.deleteInspection); // Xóa bản ghi kiểm tra
// router.get('/laptop/:laptopId', inspectController.getLatestInspectionByLaptopId);
router.get('/latest/:deviceId', inspectController.getLatestInspectionByDeviceId);
router.post("/uploadReport", uploadReport.single("file"), inspectController.uploadReport);
router.get("/downloadReport/:inspectId", inspectController.downloadReport);

module.exports = router;