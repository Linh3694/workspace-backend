const express = require("express");
const router = express.Router();
const {
  getTools,
  createTool,
  updateTool,
  deleteTool,
  bulkUploadTools,
  assignTool,
  revokeTool,
  updateToolStatus,
  uploadHandoverReport,
  getHandoverReport,
  getToolById,
  updateToolSpecs, // Thêm phần import này
  getToolFilterOptions
} = require("../../controllers/Inventory/toolController");
const validateToken = require("../../middleware/validateToken");
const { upload, processFile } = require("../../middleware/uploadHandover");


router.use(validateToken);

router.get("/filter-options", getToolFilterOptions);
router.get("/", getTools);
router.get("/:id", getToolById);

router.post("/", createTool);
router.put("/:id", updateTool);
router.delete("/:id", deleteTool);
router.put("/:id/specs", updateToolSpecs);
router.post("/upload", upload.single("file"), processFile, uploadHandoverReport);
router.get("/handover/:filename", getHandoverReport);
router.post("/bulk-upload", bulkUploadTools);
router.post("/:id/assign", assignTool);
router.post("/:id/revoke", revokeTool);
router.put("/:id/status", updateToolStatus);

module.exports = router;