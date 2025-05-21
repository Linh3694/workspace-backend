const express = require("express");
const router = express.Router();
const notificationController = require("../../controllers/Notification/notificationController");
const authenticate = require("../../middleware/authMiddleware");

// Đăng ký thiết bị để nhận thông báo
router.post("/register-device", authenticate, notificationController.registerDevice);

// Hủy đăng ký thiết bị
router.post("/unregister-device", authenticate, notificationController.unregisterDevice);

// Lấy danh sách thông báo
router.get("/", authenticate, notificationController.getNotifications);

// Đánh dấu thông báo đã đọc
router.put("/:notificationId/read", authenticate, notificationController.markAsRead);

// Đánh dấu tất cả thông báo đã đọc
router.put("/mark-all-read", authenticate, notificationController.markAllAsRead);

// Xóa thông báo
router.delete("/:notificationId", authenticate, notificationController.deleteNotification);

// Xóa tất cả thông báo
router.delete("/", authenticate, notificationController.deleteAllNotifications);

module.exports = router; 