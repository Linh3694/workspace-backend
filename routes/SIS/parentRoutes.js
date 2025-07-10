const express = require('express');
const router = express.Router();
const parentController = require('../../controllers/SIS/parentController');
const authMiddleware = require('../../middleware/authMiddleware');

// Lấy danh sách tất cả phụ huynh
router.get('/', parentController.getAllParents);

// Lấy thông tin một phụ huynh theo ID
router.get('/:id', parentController.getParentById);

// Tạo phụ huynh mới
router.post('/', authMiddleware, parentController.createParent);

// Tạo phụ huynh mới kèm tài khoản User
router.post('/with-account', authMiddleware, parentController.createParentWithAccount);

// Cập nhật thông tin phụ huynh
router.put('/:id', authMiddleware, parentController.updateParent);

// Xóa phụ huynh
router.delete('/:id', authMiddleware, parentController.deleteParent);



module.exports = router;