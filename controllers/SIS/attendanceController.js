// controllers/attendanceController.js
const Attendance = require("../../models/Attendance");

// Ghi nhận điểm danh
exports.createAttendance = async (req, res) => {
  try {
    const { student, class: classId, date, status, teacher, note } = req.body;
    const newAttendance = await Attendance.create({
      student,
      class: classId,
      date,
      status,
      teacher,
      note,
    });
    return res.status(201).json(newAttendance);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy điểm danh của học sinh
exports.getAttendanceByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    const query = { student: studentId };
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    const attendance = await Attendance.find(query)
      .populate("class")
      .populate("teacher");
    return res.json(attendance);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy điểm danh của lớp
exports.getAttendanceByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    const query = { class: classId };
    if (date) query.date = new Date(date);
    const attendance = await Attendance.find(query)
      .populate("student")
      .populate("teacher");
    return res.json(attendance);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật điểm danh
exports.updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Attendance.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Attendance not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa điểm danh
exports.deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Attendance.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Attendance not found" });
    }
    return res.json({ message: "Attendance deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Ghi nhận điểm danh hàng loạt
exports.bulkCreateAttendance = async (req, res) => {
  try {
    const { classId, date, records } = req.body;
    // records: [{ studentId, status, note }]
    const attendanceToInsert = records.map(record => ({
      student: record.studentId,
      class: classId,
      date,
      status: record.status,
      teacher: req.user._id, // Giả định người dùng hiện tại là giáo viên
      note: record.note,
    }));
    await Attendance.insertMany(attendanceToInsert);
    return res.json({ message: `Added ${attendanceToInsert.length} attendance records` });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};