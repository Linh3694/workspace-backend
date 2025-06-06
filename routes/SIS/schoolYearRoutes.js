const express = require("express");
const router = express.Router();
const schoolYearController = require("../../controllers/SIS/schoolYearController");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Các routes cho quản lý năm học
router.post("/", schoolYearController.createSchoolYear);
router.get("/", schoolYearController.getAllSchoolYears);
router.get("/current", schoolYearController.getCurrentSchoolYear);
router.get("/:id", schoolYearController.getSchoolYearById);
router.put("/:id", schoolYearController.updateSchoolYear);
router.delete("/:id", schoolYearController.deleteSchoolYear);
router.post("/bulk-upload", upload.single("file"), schoolYearController.bulkUploadSchoolYears);

module.exports = router;