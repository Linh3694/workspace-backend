// backend/routes/awardCategoryRoutes.js
const express = require("express");
const router = express.Router();
const awardCategoryController = require("../../controllers/HallOfHonor/awardCategoryController");
const uploadHOF = require("../../middleware/uploadHOF");

// GET tất cả category (không cần middleware upload)
router.get("/", awardCategoryController.getAllCategories);

// GET 1 category
router.get("/:id", awardCategoryController.getCategoryById);

// POST tạo mới 1 category
router.post("/", awardCategoryController.createCategory);

// PUT sửa 1 category
router.put("/:id", (req, res, next) => {
    uploadHOF.single("file")(req, res, function (err) {
      if (err) {
        return res.status(400).json({ error: "Lỗi khi upload file" });
      }
      next();
    });
  }, awardCategoryController.updateCategory);

// DELETE xoá 1 category
router.delete("/:id", awardCategoryController.deleteCategory);

// Tạo route riêng cho upload file
router.post("/upload", uploadHOF.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  // Trả về đường dẫn file đã lưu
  return res.json({ filePath: `uploads/HallOfFame/${req.file.filename}` });});


router.delete('/:id/sub-awards', awardCategoryController.deleteSubAward);

module.exports = router;

