const express = require("express");
const router = express.Router();
const {
  createDocument,
  getAllDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  getDocumentFile,
} = require("../../controllers/Management/documentController");
const { uploadDocument } = require("../../middleware/uploadDocument");

// Định nghĩa các endpoint
router.post("/", uploadDocument.single("file"), createDocument);
router.get("/", getAllDocuments);
router.get("/:id", getDocumentById);
router.put("/:id", uploadDocument.single("file"), updateDocument);
router.delete("/:id", deleteDocument);
router.get("/uploads/:folder/:filename", getDocumentFile);


module.exports = router;