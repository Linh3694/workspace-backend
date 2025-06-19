const express = require('express');
const router = express.Router();
const libraryActivityController = require('../../controllers/Library/libraryActivityController');
const { upload } = require('../../middleware/uploadLibraryImage');

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

// POST /api/library-activities/upload-images - Upload nhiều ảnh
router.post('/upload-images', upload.array('images', 10), libraryActivityController.uploadImages);

// POST /api/library-activities/:id/upload-images - Upload ảnh cho hoạt động cụ thể
router.post('/:id/upload-images', upload.array('images', 10), libraryActivityController.uploadImagesForActivity);

// Routes cho quản lý days
// POST /api/library-activities/:id/days - Thêm ngày mới vào hoạt động
router.post('/:id/days', libraryActivityController.addDay);

// PUT /api/library-activities/:id/days/:dayId - Cập nhật thông tin ngày
router.put('/:id/days/:dayId', libraryActivityController.updateDay);

// DELETE /api/library-activities/:id/days/:dayId - Xóa ngày khỏi hoạt động
router.delete('/:id/days/:dayId', libraryActivityController.deleteDay);

// POST /api/library-activities/:id/days/:dayId/images - Thêm ảnh vào ngày cụ thể
router.post('/:id/days/:dayId/images', libraryActivityController.addImagesToDay);

// POST /api/library-activities/:id/days/:dayId/upload-images - Upload ảnh cho ngày cụ thể
router.post('/:id/days/:dayId/upload-images', upload.array('images', 10), libraryActivityController.uploadImagesForDay);

// DELETE /api/library-activities/:id/days/:dayId/images/:imageId - Xóa ảnh khỏi ngày
router.delete('/:id/days/:dayId/images/:imageId', libraryActivityController.removeImageFromDay);

module.exports = router; 