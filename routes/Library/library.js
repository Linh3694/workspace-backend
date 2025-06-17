const express = require("express");
const router = express.Router();
const libraryController = require("../../controllers/Library/libraryController");
const uploadLibraryImage = require("../../middleware/uploadLibraryImage");


// Document Type APIs
router.get("/document-types", libraryController.getAllDocumentTypes);
router.post("/document-types", libraryController.createDocumentType);
router.put("/document-types/:id", libraryController.updateDocumentType);
router.delete("/document-types/:id", libraryController.deleteDocumentType);

// --- Thêm SeriesName APIs ---
router.get("/series-names", libraryController.getAllSeriesNames);
router.post("/series-names", libraryController.createSeriesName);
router.put("/series-names/:id", libraryController.updateSeriesName);
router.delete("/series-names/:id", libraryController.deleteSeriesName);

// -------------------- Special Code APIs -------------------- //
router.get("/special-codes", libraryController.getAllSpecialCodes);
router.post("/special-codes", libraryController.createSpecialCode);
router.put("/special-codes/:id", libraryController.updateSpecialCode);
router.delete("/special-codes/:id", libraryController.deleteSpecialCode);

// -------------------- Special Code APIs -------------------- //
router.get("/authors", libraryController.getAllAuthors);
router.post("/authors", libraryController.createAuthor);
router.put("/authors/:id", libraryController.updateAuthor);
router.delete("/authors/:id", libraryController.deleteAuthor);


// -------------------- Add Book APIs -------------------- //
router.post('/:libraryId/books', libraryController.addBookToLibrary);
router.put('/:libraryId/books/:bookIndex', libraryController.updateBookInLibrary);
router.put('/books/:bookCode', libraryController.updateBookByCode);
router.delete("/books/:bookCode", libraryController.deleteBookByCode);
router.get('/:libraryId/books', libraryController.getBooksFromLibrary);
// -------------------- Borrows Books APIs -------------------- //
router.post("/:libraryId/books/:bookIndex/borrow", libraryController.borrowBook);
router.post("/:libraryId/books/:bookIndex/return", libraryController.returnBook);
router.get("/full-libraries", libraryController.getAllLibrariesFull);
router.post("/borrow-multiple", libraryController.borrowMultipleBooks);

router.get('/books', libraryController.getAllBooks);
router.get('/new-books', libraryController.getNewBooks);
router.get('/featured-books', libraryController.getFeaturedBooks);

router.post("/", uploadLibraryImage.upload.single("file"), async (req, res) => {
  try {
    if (req.file) {
      const filePath = await uploadLibraryImage.convertToWebp(req.file.buffer, req.file.originalname);
      req.body.coverImage = filePath;
    }
    // Gọi hàm tạo Library từ controller
    libraryController.createLibrary(req, res);
  } catch (error) {
    console.error("Error creating library:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
  
// Lấy tất cả Library
router.get("/", libraryController.getAllLibraries);

// Lấy chi tiết 1 Library
router.get("/:id", libraryController.getLibraryById);

// Cập nhật Library
router.put("/:id", uploadLibraryImage.upload.single("file"), async (req, res) => {
  try {
    if (req.file) {
      const filePath = await uploadLibraryImage.convertToWebp(req.file.buffer, req.file.originalname);
      req.body.coverImage = filePath;
    }
    libraryController.updateLibrary(req, res);
  } catch (error) {
    console.error("Error updating library:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Xóa Library
router.delete("/:id", libraryController.deleteLibrary);


module.exports = router;