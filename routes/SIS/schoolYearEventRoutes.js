const express = require("express");
const router = express.Router();
const schoolYearEventController = require("../../controllers/SIS/schoolYearEventController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Các routes cho quản lý sự kiện năm học
router.post("/", schoolYearEventController.createSchoolYearEvent);
router.get("/", schoolYearEventController.getAllSchoolYearEvents);
router.get("/:id", schoolYearEventController.getSchoolYearEventById);
router.put("/:id", schoolYearEventController.updateSchoolYearEvent);
router.delete("/:id", schoolYearEventController.deleteSchoolYearEvent);

// Routes đặc biệt
router.get("/school-year/:schoolYearId", schoolYearEventController.getEventsBySchoolYear);
router.get("/type/:type", schoolYearEventController.getEventsByType);
router.get("/month/:year/:month", schoolYearEventController.getEventsByMonth);

module.exports = router; 