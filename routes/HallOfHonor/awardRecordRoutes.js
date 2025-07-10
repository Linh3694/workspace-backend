// backend/routes/awardRecordRoutes.js
const express = require("express");
const router = express.Router();
const uploadExcel = require("../../middleware/uploadExcel");
const awardRecordController = require("../../controllers/HallOfHonor/awardRecordController");

router.get("/", awardRecordController.getAllAwardRecords);

router.post("/upload-excel", uploadExcel.single("file"),
    awardRecordController.uploadExcelStudents);
router.post("/upload-excel-classes", uploadExcel.single("file"),
    awardRecordController.uploadExcelClasses);

router.get("/:id", awardRecordController.getAwardRecordById);
router.post("/", awardRecordController.createAwardRecord);
router.post("/bulk-students", awardRecordController.bulkCreateStudentRecords);
router.put("/:id", awardRecordController.updateAwardRecord);
router.delete("/:id", awardRecordController.deleteAwardRecord);
// Xoá 1 sub‑award (custom) + mọi record liên quan

module.exports = router;