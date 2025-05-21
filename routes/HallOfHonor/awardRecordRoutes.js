// backend/routes/awardRecordRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const awardRecordController = require("../../controllers/HallOfHonor/awardRecordController");

router.get("/", awardRecordController.getAllAwardRecords);

router.post("/upload-excel", upload.single("file"),
    awardRecordController.uploadExcelStudents);
router.post("/upload-excel-classes", upload.single("file"),
    awardRecordController.uploadExcelClasses);

router.get("/:id", awardRecordController.getAwardRecordById);
router.post("/", awardRecordController.createAwardRecord);
router.put("/:id", awardRecordController.updateAwardRecord);
router.delete("/:id", awardRecordController.deleteAwardRecord);
// Xoá 1 sub‑award (custom) + mọi record liên quan

module.exports = router;