const express = require("express");
const router = express.Router();
const {
  getAllRooms,
  getDevicesByRoom,
  addRoom,
  updateRoom,
  deleteRoom,
  getRoomById,
} = require("../../controllers/Management/roomController");
const Room = require("../../models/Room"); // Mô hình phòng từ cơ sở dữ liệu

router.get("/:roomId/devices", getDevicesByRoom);
// Lấy tất cả phòng
router.get("/", getAllRooms);

// Thêm phòng mới
router.post("/", addRoom);

router.get("/:id", getRoomById);

// Cập nhật phòng
router.put("/:id", updateRoom);

// Xóa phòng
router.delete("/:id", deleteRoom);

// Route xử lý tải lên nhiều phòng
router.post("/bulk", async (req, res) => {
  try {
    const { rooms } = req.body;

    if (!rooms || !Array.isArray(rooms)) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }

    // Lưu dữ liệu phòng vào database
    const savedRooms = await Room.insertMany(rooms, { ordered: false });
    res.status(201).json({ message: "Danh sách phòng đã được lưu.", rooms: savedRooms });
  } catch (error) {
    console.error("Lỗi khi lưu danh sách phòng:", error.message);
    res.status(500).json({ message: "Có lỗi xảy ra khi lưu danh sách phòng.", error: error.message });
  }
});


module.exports = router;