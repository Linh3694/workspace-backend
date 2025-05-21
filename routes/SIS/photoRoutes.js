// routes/photoRoutes.js
const express = require("express");
const router = express.Router();
const uploadZip = require("../../middleware/uploadZip");
const uploadSinglePhoto = require("../../middleware/uploadStudents");
const photoController = require("../../controllers/SIS/photoController");

// Tạo mới photo => upload.single("photo") 
router.post("/student", uploadSinglePhoto.single("photo"), photoController.uploadStudentPhoto);
router.post("/class", uploadSinglePhoto.single("photo"), photoController.uploadClassPhoto);
router.get("/", photoController.getAllPhotos);
router.get("/:id", photoController.getPhotoById);
router.delete("/:id", photoController.deletePhoto);
router.post("/bulk-zip", uploadZip.single("zipFile"), photoController.bulkUploadPhotosFromZip);
router.post("/bulk-upload-class", uploadZip.single("file"), photoController.bulkUploadClassPhotosFromZip);


module.exports = router;