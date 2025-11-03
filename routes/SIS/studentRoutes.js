const express = require('express');
const router = express.Router();
const studentController = require('../../controllers/SIS/studentController');
const multer = require('multer');
const upload = multer();
const uploadStudentAvatar = require('../../middleware/uploadStudents');
const uploadStudentZip = require('../../middleware/uploadStudentZip');
const excelUpload = require('../../middleware/excelUpload');

// Define routes for Students
router.get('/', studentController.getStudents);
router.get('/search', studentController.searchStudents);

// Routes cho Photo management - ĐẶT TRƯỚC routes generic /:id
router.post('/:id/photo', uploadStudentAvatar.single('avatar'), studentController.uploadStudentPhoto);
router.get('/:id/photo/current', studentController.getCurrentStudentPhoto); // Lấy ảnh hiện tại
router.get('/:id/photo/:schoolYear', studentController.getStudentPhotoByYear);
router.get('/:id/photos', studentController.getAllStudentPhotos);

// Route: Upload hàng loạt ảnh học sinh từ ZIP
router.post('/bulk-upload-images', uploadStudentZip.single('zipFile'), studentController.bulkUploadStudentImages);

// Route: Import hàng loạt học sinh từ Excel (tạm thời bỏ middleware để test)
router.post('/bulk-import-students', studentController.bulkImportStudents);

// Test route để debug
router.get('/test-bulk-import', (req, res) => {
  res.json({
    message: 'Student bulk import route is working!',
    timestamp: new Date(),
    route: '/api/students/bulk-import-students (POST)',
    expectedField: 'excelFile'
  });
});

// Route test đơn giản
router.post('/test-upload', (req, res) => {
  res.json({
    message: 'Test upload endpoint working!',
    receivedBody: !!req.body,
    receivedFile: !!req.file,
    timestamp: new Date()
  });
});

// Routes generic - ĐẶT SAU routes cụ thể
// Đảm bảo /:id không conflict với /import
router.get('/:id', studentController.getStudentById);
router.post('/', uploadStudentAvatar.single('avatar'), studentController.createStudent);
router.put('/:id', uploadStudentAvatar.single('avatar'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);
router.patch('/:id/remove-family', studentController.removeFamilyFromStudent);

module.exports = router;