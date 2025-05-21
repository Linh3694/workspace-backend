// routes/tripRoutes.js
const express = require("express");
const router = express.Router();
const tripController = require("../../controllers/Bus/tripController");

router.get("/", tripController.getAllTrips);
router.post("/", tripController.createTrip);
router.put("/:id", tripController.updateTrip);
router.delete("/:id", tripController.deleteTrip);

// Endpoint cập nhật trạng thái điểm danh của học sinh trong chuyến xe
router.patch("/:tripId/students/:studentId", tripController.updateStudentAttendance);

module.exports = router;