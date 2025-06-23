const express = require("express");
const enrollmentController = require("../../controllers/SIS/enrollmentController");

const router = express.Router();

// Debug endpoint để test route hoạt động
router.get("/test", (req, res) => {
  res.json({ message: "Enrollment routes working!", timestamp: new Date() });
});

// POST / - create enrollment
router.post("/", enrollmentController.createEnrollment);
// POST /bulk-import - bulk import enrollments from Excel
router.post("/bulk-import", enrollmentController.bulkImportEnrollments);
// GET / - get all enrollments
router.get("/", enrollmentController.getAllEnrollments);
// GET /:id - get enrollment by id
router.get("/:id", enrollmentController.getEnrollmentById);
// GET /class/:classId - get enrollments by class
router.get("/class/:classId", enrollmentController.getEnrollmentsByClass);
// GET /student/:studentId - get enrollments by student
router.get("/student/:studentId", enrollmentController.getEnrollmentsByStudent);
// PUT /:id - update enrollment
router.put("/:id", enrollmentController.updateEnrollment);
// DELETE /:id - delete enrollment
router.delete("/:id", enrollmentController.deleteEnrollment);

module.exports = router;