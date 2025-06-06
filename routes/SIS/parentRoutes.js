const express = require('express');
const router = express.Router();
const parentController = require('../../controllers/SIS/parentController');

// Lấy danh sách tất cả phụ huynh
router.get('/', parentController.getAllParents);

// Lấy thông tin một phụ huynh theo ID
router.get('/:id', parentController.getParentById);

// Tạo phụ huynh mới
router.post('/', parentController.createParent);

// Cập nhật thông tin phụ huynh
router.put('/:id', parentController.updateParent);

// Xóa phụ huynh
router.delete('/:id', parentController.deleteParent);



module.exports = router;