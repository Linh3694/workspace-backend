const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateToken");
const userController = require("../../controllers/Management/userController");
const uploadAvatar = require("../../middleware/uploadAvatar");

// GET danh sách người dùng
router.get("/", userController.getAllUsers);

// PUT bulk update
router.put("/bulk-update", userController.bulkUpdateUsers);

// PUT upload avatar hàng loạt
router.put("/bulk-avatar", uploadAvatar.array("avatars"), userController.bulkAvatarUpload);

// GET search
router.get("/search", userController.searchUsers);

// GET danh sách người dùng trong cùng phòng ban
router.get("/department/:department", validateToken, userController.getUsersByDepartment);

// GET user hiện tại (me)
router.get("/me", validateToken, userController.getCurrentUser);

// GET user theo ID
router.get("/:id", validateToken, userController.getUserById);

// PUT cập nhật user (1 user) + uploadAvatar single
router.put("/:id", uploadAvatar.single("avatar"), userController.updateUser);

// POST tạo user
router.post("/", uploadAvatar.single("avatar"), userController.createUser);

// POST tạo nhiều users cùng lúc
router.post("/batch", userController.createBatchUsers);

// POST import users từ Excel
router.post("/bulk-upload", uploadAvatar.single("excelFile"), userController.bulkUploadUsers);

// PUT đổi mật khẩu
router.put("/:id/change-password", validateToken, userController.changePassword);

// PUT reset mật khẩu (admin only)
router.put("/:id/reset-password", validateToken, userController.resetPassword);

// PUT cập nhật chấm công
router.put("/attendance", userController.updateAttendance);

// DELETE xóa user
router.delete("/:id", userController.deleteUser);

// GET thiết bị được gán cho user
router.get("/:userId/assigned-items", userController.getAssignedItems);

// POST thiết bị gán (alternative endpoint)
router.post("/assign-device", userController.getAssignedItems);

module.exports = router;