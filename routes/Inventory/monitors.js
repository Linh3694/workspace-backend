const express = require("express");
const router = express.Router();
const {
  getMonitors,
  getMonitorById,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  updateMonitorSpecs,
  bulkUploadMonitors,
  assignMonitor,
  revokeMonitor,
  updateMonitorStatus,
  uploadHandoverReport,
  getHandoverReport
} = require("../../controllers/Inventory/monitorController");

const validateToken = require("../../middleware/validateToken");
const { upload, processFile } = require("../../middleware/uploadHandover");

router.use(validateToken);

// Khai báo các route, toàn bộ xử lý nằm trong controller
router.get("/", getMonitors);
router.get("/:id", getMonitorById);
router.post("/", createMonitor);
router.put("/:id", updateMonitor);
router.delete("/:id", deleteMonitor);
router.put("/:id/specs", updateMonitorSpecs);
router.post("/upload", upload.single("file"), processFile, uploadHandoverReport);
router.get("/handover/:filename", getHandoverReport);
router.post("/bulk-upload", bulkUploadMonitors);
router.post("/:id/assign", assignMonitor);
router.post("/:id/revoke", revokeMonitor);
router.put("/:id/status", updateMonitorStatus);

module.exports = router;