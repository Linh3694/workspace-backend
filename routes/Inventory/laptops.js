const express = require("express");
const router = express.Router();
const {
  getLaptops,
  createLaptop,
  updateLaptop,
  deleteLaptop,
  assignLaptop,
  revokeLaptop,
  updateLaptopStatus,
  bulkUploadLaptops,
  uploadHandoverReport,
  getHandoverReport,
  getLaptopById,      // ✅ Thêm hàm mới từ controller
  updateLaptopSpecs,  
  fixOldData
} = require("../../controllers/Inventory/laptopController");
const Laptop = require("../../models/Laptop"); // Import model
const validateToken = require("../../middleware/validateToken");
const { upload, processFile } = require("../../middleware/uploadHandover");

router.use(validateToken);

// Routes
router.get("/", getLaptops);
router.post("/", createLaptop);
router.put("/:id", updateLaptop);
router.delete("/:id", deleteLaptop);
router.post("/upload", upload.single("file"), processFile, uploadHandoverReport);
router.get("/handover/:filename", getHandoverReport);
router.post("/bulk-upload", bulkUploadLaptops);
router.post("/:id/assign", assignLaptop);
router.post("/:id/revoke", revokeLaptop);
router.put("/:id/status", updateLaptopStatus);
router.get("/:id", getLaptopById);
router.put("/:id/specs", updateLaptopSpecs);
router.post("/fix-laptops", fixOldData);


module.exports = router;