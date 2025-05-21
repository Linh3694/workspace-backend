// routes/studentRoutes.js
const express = require("express");
const router = express.Router();
const uploadExcel = require("../../middleware/excelUpload");
const studentController = require("../../controllers/SIS/studentController");

router.post("/bulk", uploadExcel.single("excelFile"), studentController.bulkUploadStudents);
router.get("/search", studentController.searchStudents);
router.post("/", studentController.createStudent);
router.get("/", studentController.getAllStudents);
router.get("/:id", studentController.getStudentById);
router.put("/:id", studentController.updateStudent);
router.delete("/:id", studentController.deleteStudent);


module.exports = router;