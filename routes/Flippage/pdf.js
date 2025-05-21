const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadPdf"); // Import middleware mới
const pdfController = require("../../controllers/Flippage/pdfController");
const authenticate = require("../../middleware/authMiddleware");


// Endpoint upload PDF
router.post("/upload-pdf", authenticate, upload.single("pdfFile"), pdfController.uploadPdf);
router.get("/get-images/:customName", pdfController.getImages);
router.get("/get-all-pdfs", authenticate, pdfController.getAllPdfs);
router.put("/update-pdf/:id", authenticate, pdfController.updatePdf )
router.delete("/delete-pdf/:id", authenticate, pdfController.deletePdf);
router.put("/toggle-active/:id",  pdfController.toggleActiveStatus);
router.delete("/delete-permanently/:id", pdfController.permanentlyDeletePdf);
router.get("/get-bookmarks/:customName", pdfController.getBookmarks);
router.put("/update-bookmarks/:id", authenticate, pdfController.updateBookmarks);
router.get("/check-customname/:customName", pdfController.checkCustomName);
router.get("/check-custom-name/:customName", pdfController.checkCustomeNameUrl);
router.get("/get-pdf-status/:customName", pdfController.getPdfStatus);
router.get("/fix-all-file-names", pdfController.fixAllFileNames);
router.get("/fix-missing-views", pdfController.fixMissingViews);

module.exports = router;