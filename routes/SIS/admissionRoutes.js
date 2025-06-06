const express = require("express");
const router = express.Router();
const admissionController = require("../../controllers/SIS/admissionController");

router.post("/", admissionController.createAdmission);
router.get("/", admissionController.getAllAdmissions);
router.put("/:id", admissionController.updateAdmission);
router.put("/:id/nextStage", admissionController.nextStage);

module.exports = router;