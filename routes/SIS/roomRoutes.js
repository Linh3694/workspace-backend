const express = require("express");
const router = express.Router();
const roomController = require("../../controllers/SIS/roomController");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

// Route: Lấy tất cả phòng học
router.get("/", roomController.getAllRooms);

// Route: Tạo phòng học mới
router.post("/", isAdmin, roomController.createRoom);

// Route: Lấy phòng học theo ID
router.get("/:id", roomController.getRoomById);

// Route: Cập nhật phòng học
router.put("/:id", isAdmin, roomController.updateRoom);

// Route: Xóa phòng học
router.delete("/:id", isAdmin, roomController.deleteRoom);

module.exports = router; 