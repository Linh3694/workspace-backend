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
router.post('/', familyController.createFamily);

// Cập nhật Family
router.put('/:id', familyController.updateFamily);

// Xóa Family
router.delete('/:id', familyController.deleteFamily);

// Thêm Parent vào Family
router.post('/:id/parents', familyController.addParentToFamily);

// Thêm Parent vào Family
router.post('/:id/add-parent', familyController.addParentToFamily);

// Xóa Parent khỏi Family
router.delete('/:id/parents/:parentId', familyController.removeParentFromFamily);

// Alias route để tương thích với FE gọi /remove-parent/:parentId
router.delete('/:id/remove-parent/:parentId', familyController.removeParentFromFamily);

// Xóa Student khỏi Family
router.delete('/:id/remove-student/:studentId', familyController.removeStudentFromFamily);

// Cập nhật quan hệ parent trong family
router.patch('/:familyId/update-parent/:parentId', familyController.updateParentInFamily);

module.exports = router; 