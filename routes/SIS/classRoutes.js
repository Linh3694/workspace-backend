// routes/classRoutes.js
const express = require("express");
const router = express.Router();
const uploadExcel = require("../../middleware/excelUpload"); // file vừa tạo
const classController = require("../../controllers/SIS/classController");

router.post("/bulk", uploadExcel.single("excelFile"), classController.bulkUploadClasses);
router.post("/", classController.createClass);
router.get("/", classController.getAllClasses);
router.get("/:id", classController.getClassById);
router.put("/:id", classController.updateClass);
router.delete("/:id", classController.deleteClass);

module.exports = router;