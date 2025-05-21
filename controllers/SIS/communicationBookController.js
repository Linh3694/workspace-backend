// controllers/communicationBookController.js
const CommunicationBook = require("../../models/CommunicationBook");

// Tạo ghi chú sổ liên lạc
exports.createCommunication = async (req, res) => {
  try {
    const { student, date, content, teacher, parent } = req.body;
    const newCommunication = await CommunicationBook.create({
      student,
      date,
      content,
      teacher,
      parent,
    });
    return res.status(201).json(newCommunication);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy ghi chú của học sinh
exports.getCommunicationsByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const communications = await CommunicationBook.find({ student: studentId })
      .populate("teacher")
      .populate("parent");
    return res.json(communications);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật ghi chú
exports.updateCommunication = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await CommunicationBook.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Communication not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa ghi chú
exports.deleteCommunication = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await CommunicationBook.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Communication not found" });
    }
    return res.json({ message: "Communication deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};