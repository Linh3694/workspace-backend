// controllers/curriculumController.js
const Curriculum = require("../../models/Curriculum");

// Tạo giáo trình mới
exports.createCurriculum = async (req, res) => {
  try {
    const { educationalSystem, gradeLevel, subjects, description } = req.body;
    const newCurriculum = await Curriculum.create({
      educationalSystem,
      gradeLevel,
      subjects,
      description,
    });
    return res.status(201).json(newCurriculum);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy tất cả giáo trình
exports.getAllCurriculums = async (req, res) => {
  try {
    const curriculums = await Curriculum.find()
      .populate("educationalSystem")
      .populate("subjects");
    return res.json(curriculums);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy giáo trình theo ID
exports.getCurriculumById = async (req, res) => {
  try {
    const { id } = req.params;
    const curriculum = await Curriculum.findById(id)
      .populate("educationalSystem")
      .populate("subjects");
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    return res.json(curriculum);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật giáo trình
exports.updateCurriculum = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Curriculum.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa giáo trình
exports.deleteCurriculum = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Curriculum.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    return res.json({ message: "Curriculum deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};