// backend/routes/jobRoutes.js
const express = require("express");
const router = express.Router();
const jobController = require("../../controllers/Recruitment/jobController");

router.post("/", jobController.createJob);
router.get("/", jobController.getJobs);
router.put("/:id", jobController.updateJob); // Sửa job theo ID
router.delete("/:id", jobController.deleteJob); // Xoá job theo ID
router.put("/toggle-active/:id", jobController.toggleJobActive); // Cập nhật trạng thái active
router.get("/:id", jobController.getJobById); // Lấy job theo ID

module.exports = router;