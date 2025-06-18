const express = require('express');
const router = express.Router();
const libraryActivityController = require('../../controllers/Library/libraryActivityController');

// GET /api/library-activities - Lấy tất cả hoạt động
router.get('/', libraryActivityController.getAllActivities);

// GET /api/library-activities/:id - Lấy một hoạt động theo ID
router.get('/:id', libraryActivityController.getActivityById);

// POST /api/library-activities - Tạo hoạt động mới
router.post('/', libraryActivityController.createActivity);

// PUT /api/library-activities/:id - Cập nhật hoạt động
router.put('/:id', libraryActivityController.updateActivity);

// DELETE /api/library-activities/:id - Xóa hoạt động
router.delete('/:id', libraryActivityController.deleteActivity);

// POST /api/library-activities/:id/images - Thêm ảnh vào hoạt động
router.post('/:id/images', libraryActivityController.addImages);

// DELETE /api/library-activities/:id/images/:imageId - Xóa ảnh khỏi hoạt động
router.delete('/:id/images/:imageId', libraryActivityController.removeImage);

module.exports = router; 