const express = require("express");
const router = express.Router();
const {
  getPhones,
  createPhone,
  updatePhone,
  deletePhone,
  assignPhone,
  revokePhone,
  updatePhoneStatus,
  getPhoneById,
  updatePhoneSpecs,
  getPhoneFilterOptions,
  uploadHandoverReport,
  getHandoverReport
} = require("../../controllers/Inventory/phoneController");
const Phone = require("../../models/Phone"); // Import model
const validateToken = require("../../middleware/validateToken");
const { upload, processFile } = require("../../middleware/uploadHandover");

router.use(validateToken);

// Routes
router.get("/filter-options", getPhoneFilterOptions);
router.get("/", getPhones);
router.post("/", createPhone);
router.put("/:id", updatePhone);
router.delete("/:id", deletePhone);
router.post("/upload", upload.single("file"), processFile, uploadHandoverReport);
router.get("/handover/:filename", getHandoverReport);
router.post("/:id/assign", assignPhone);
router.post("/:id/revoke", revokePhone);
router.put("/:id/status", updatePhoneStatus);
router.get("/:id", getPhoneById);
router.put("/:id/specs", updatePhoneSpecs);

module.exports = router; 