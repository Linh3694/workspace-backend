const express = require('express');
const router = express.Router();
const studentController = require('../../controllers/SIS/studentController');
const multer = require('multer');
const upload = multer();
const uploadStudentAvatar = require('../../middleware/uploadStudents');

// Define routes for Students
router.get('/', studentController.getStudents);
router.get('/search', studentController.searchStudents);
router.get('/:id', studentController.getStudentById);
router.post('/', uploadStudentAvatar.single('avatar'), studentController.createStudent);
router.put('/:id', uploadStudentAvatar.single('avatar'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);
router.patch('/:id/remove-family', studentController.removeFamilyFromStudent);

// Routes cho Photo management
router.post('/:id/photo', uploadStudentAvatar.single('avatar'), studentController.uploadStudentPhoto);
router.get('/:id/photo/current', studentController.getCurrentStudentPhoto); // Lấy ảnh hiện tại
router.get('/:id/photo/:schoolYear', studentController.getStudentPhotoByYear);
router.get('/:id/photos', studentController.getAllStudentPhotos);

module.exports = router;