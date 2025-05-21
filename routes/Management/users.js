const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateToken");
const userController = require("../../controllers/Management/userController");
const uploadAvatar = require("../../middleware/uploadAvatar");

// GET danh sách người dùng
router.get("/", userController.getUsers);

// PUT bulk update
router.put("/bulk-update", userController.bulkUpdateUsers);

// PUT upload avatar hàng loạt
router.put("/bulk-avatar", uploadAvatar.array("avatars"), userController.bulkAvatarUpload);

// GET search
router.get("/search", userController.searchUsers);

// GET danh sách người dùng trong cùng phòng ban
router.get("/department/:department", validateToken, userController.getUsersByDepartment);

// GET user theo ID (hoặc 'me')
router.get("/:id", validateToken, userController.getUserById);

// PUT cập nhật user (1 user) + uploadAvatar single
router.put("/:id", uploadAvatar.single("avatar"), userController.updateUser);

// POST tạo user
router.post("/", userController.createUser);

// DELETE xóa user
router.delete("/:id", userController.deleteUser);

// Thiết bị gán
router.post("/assign-device", userController.getAssignedItems);


router.get("/:userId/assigned-items", userController.getAssignedItems);

module.exports = router;