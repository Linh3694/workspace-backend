const express = require("express");
const router = express.Router();
const {
  getPrinters,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  updatePrinterSpecs,
  bulkUploadPrinters,
  assignPrinter,
  revokePrinter,
  updatePrinterStatus,
  uploadHandoverReport,
  getHandoverReport,
  getPrinterFilterOptions
} = require("../../controllers/Inventory/printerController");

const validateToken = require("../../middleware/validateToken");
const { upload, processFile } = require("../../middleware/uploadHandover");


router.use(validateToken);

// Khai báo các route, toàn bộ xử lý nằm trong controller
router.get("/filter-options", getPrinterFilterOptions);
router.get("/", getPrinters);
router.get("/:id", getPrinterById);
router.post("/", createPrinter);
router.put("/:id", updatePrinter);
router.delete("/:id", deletePrinter);
router.put("/:id/specs", updatePrinterSpecs);
router.post("/bulk-upload", bulkUploadPrinters);
router.post("/upload", upload.single("file"), processFile, uploadHandoverReport);
router.get("/handover/:filename", getHandoverReport);
router.post("/:id/assign", assignPrinter);
router.post("/:id/revoke", revokePrinter);
router.put("/:id/status", updatePrinterStatus);

module.exports = router;