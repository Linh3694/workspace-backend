// controllers/reportController.js
const Report = require("../../models/Report");

// Tạo báo cáo mới
exports.createReport = async (req, res) => {
  try {
    const { schoolYear, class: classId, student, type, data } = req.body;
    const newReport = await Report.create({
      schoolYear,
      class: classId,
      student,
      type,
      data,
    });
    return res.status(201).json(newReport);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy báo cáo theo lớp
exports.getReportsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const reports = await Report.find({ class: classId }).populate("schoolYear");
    return res.json(reports);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy báo cáo theo học sinh
exports.getReportsByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const reports = await Report.find({ student: studentId }).populate("schoolYear");
    return res.json(reports);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật báo cáo
exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Report.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Report not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa báo cáo
exports.deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Report.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Report not found" });
    }
    return res.json({ message: "Report deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};