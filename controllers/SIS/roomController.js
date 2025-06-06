const mongoose = require("mongoose");
const Room = require("../../models/Room");
const Subject = require("../../models/Subject");
const {
  syncTimetableAfterRoomUpdate,
} = require("../services/timetableSync.service");

// Lấy tất cả phòng học
exports.getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate('subjects', 'name code')
      .sort({ name: 1 });
    return res.json({ data: rooms });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy phòng học theo ID
exports.getRoomById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID phòng học không hợp lệ" });
    }

    const room = await Room.findById(id).populate('subjects', 'name code');
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng học" });
    }

    return res.json({ data: room });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Tạo phòng học mới
exports.createRoom = async (req, res) => {
  try {
    const { name, type, capacity, periodsPerDay = 10, subjects } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "Tên và loại phòng học là bắt buộc" });
    }

    const room = await Room.create({
      name,
      type,
      capacity,
      periodsPerDay,
      subjects: subjects || [],
    });

    // Cập nhật reference trong các subject
    if (subjects && subjects.length > 0) {
      await Subject.updateMany(
        { _id: { $in: subjects } },
        { $addToSet: { rooms: room._id } }
      );
    }

    await room.populate('subjects', 'name code');
    res.status(201).json({ data: room });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(400).json({ message: "Không thể tạo phòng học" });
  }
};

// Cập nhật phòng học
exports.updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, capacity, periodsPerDay, subjects = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID phòng học không hợp lệ" });
    }

    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng học" });
    }

    // ---- So sánh danh sách subject trước và sau ----
    const prevSubjects = room.subjects.map((s) => s.toString());
    const newSubjects = subjects.map((s) => s.toString());

    const add = newSubjects.filter((s) => !prevSubjects.includes(s));
    const remove = prevSubjects.filter((s) => !newSubjects.includes(s));

    // ---- Cập nhật room ----
    room.name = name ?? room.name;
    room.type = type ?? room.type;
    room.capacity = capacity ?? room.capacity;
    room.periodsPerDay = periodsPerDay ?? room.periodsPerDay;
    room.subjects = newSubjects;
    await room.save();

    // ---- Sync subjects → rooms field ----
    if (add.length) {
      await Subject.updateMany(
        { _id: { $in: add } },
        { $addToSet: { rooms: room._id } }
      );
    }
    if (remove.length) {
      await Subject.updateMany(
        { _id: { $in: remove } },
        { $pull: { rooms: room._id } }
      );
    }
    for (const subId of add) {
      await syncTimetableAfterRoomUpdate({ subjectId: subId, roomId: room._id });
    }
    const populated = await Room.findById(id).populate("subjects", "name code");
    return res.json({ data: populated });
  } catch (error) {
    console.error("Error updating room:", error);
    return res.status(400).json({ message: "Không thể cập nhật phòng học" });
  }
};

// Xóa phòng học
exports.deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID phòng học không hợp lệ" });
    }

    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng học" });
    }

    // Xóa reference trong các subject
    if (room.subjects && room.subjects.length > 0) {
      await Subject.updateMany(
        { _id: { $in: room.subjects } },
        { $unset: { room: "" } }
      );
    }

    await Room.findByIdAndDelete(id);
    return res.json({ data: { message: "Xóa phòng học thành công" } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}; 