const express = require('express');
const router = express.Router();
const familyController = require('../../controllers/SIS/familyController');
const authMiddleware = require('../../middleware/authMiddleware');

// Lấy danh sách tất cả Family
router.get('/', familyController.getFamilies);

// Lấy Family theo ID
router.get('/:id', familyController.getFamilyById);

// Tìm kiếm Family theo mã
router.get('/code/:code', familyController.getFamilyByCode);

// Tạo Family mới
router.post('/', authMiddleware, familyController.createFamily);

// Cập nhật Family
router.put('/:id', authMiddleware, familyController.updateFamily);

// Xóa Family
router.delete('/:id', authMiddleware, familyController.deleteFamily);

// Thêm Parent vào Family
router.post('/:id/parents', authMiddleware, familyController.addParentToFamily);

// Thêm Parent vào Family
router.post('/:id/add-parent', authMiddleware, familyController.addParentToFamily);

// Xóa Parent khỏi Family
router.delete('/:id/parents/:parentId', authMiddleware, familyController.removeParentFromFamily);

// Alias route để tương thích với FE gọi /remove-parent/:parentId
router.delete('/:id/remove-parent/:parentId', authMiddleware, familyController.removeParentFromFamily);

// Xóa Student khỏi Family
router.delete('/:id/remove-student/:studentId', authMiddleware, familyController.removeStudentFromFamily);

// Cập nhật quan hệ parent trong family
router.patch('/:familyId/update-parent/:parentId', authMiddleware, familyController.updateParentInFamily);

module.exports = router; 