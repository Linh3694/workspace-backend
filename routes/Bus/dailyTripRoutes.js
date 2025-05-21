const express = require("express");
const router = express.Router();
const dailyTripController = require("../../controllers/Bus/dailyTripController");

// Lấy danh sách daily trips theo ngày (query: ?date=YYYY-MM-DD)
router.get("/", dailyTripController.getDailyTrips);

// Tạo mới daily trip log
router.post("/", dailyTripController.createDailyTrip);

// Cập nhật daily trip log
router.put("/:id", dailyTripController.updateDailyTrip);

// Xóa daily trip log
router.delete("/:id", dailyTripController.deleteDailyTrip);

router.put('/:dailyTripId/students/:studentId/attendance', dailyTripController.updateStudentAttendance);


router.get('/find-student/:studentId', dailyTripController.findStudentBusInfo);

module.exports = router;