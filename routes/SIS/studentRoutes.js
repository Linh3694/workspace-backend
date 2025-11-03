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

// Route: Import hàng loạt học sinh từ Excel
router.post('/import', excelUpload.single('excelFile'), studentController.bulkImportStudents);

// Routes generic - ĐẶT SAU routes cụ thể
router.get('/:id', studentController.getStudentById);
router.post('/', uploadStudentAvatar.single('avatar'), studentController.createStudent);
router.put('/:id', uploadStudentAvatar.single('avatar'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);
router.patch('/:id/remove-family', studentController.removeFamilyFromStudent);

module.exports = router;