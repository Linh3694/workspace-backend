// routes/studentClassEnrollmentRoutes.js
const express = require("express");
const router = express.Router();
const uploadExcel = require("../../middleware/excelUpload");
const enrollmentController = require("../../controllers/SIS/studentClassEnrollmentController");

router.post("/bulk", uploadExcel.single("excelFile"), enrollmentController.bulkUploadEnrollments);
router.post("/", enrollmentController.enrollStudentToClass);
router.get("/", enrollmentController.getAllEnrollments);
router.get("/:id", enrollmentController.getEnrollmentById);
router.put("/:id", enrollmentController.updateEnrollment);
router.delete("/:id", enrollmentController.deleteEnrollment);

module.exports = router;