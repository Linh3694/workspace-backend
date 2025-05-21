// routes/schoolYearRoutes.js
const express = require("express");
const router = express.Router();

const schoolYearController = require("../../controllers/SIS/schoolYearController");

router.post("/", schoolYearController.createSchoolYear);
router.get("/", schoolYearController.getAllSchoolYears);
router.get("/:id", schoolYearController.getSchoolYearById);
router.put("/:id", schoolYearController.updateSchoolYear);
router.delete("/:id", schoolYearController.deleteSchoolYear);

module.exports = router;