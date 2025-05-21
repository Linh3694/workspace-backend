// controllers/subjectController.js
const Subject = require("../../models/Subject");

// CRUD cơ bản
exports.createSubject = async (req, res) => {
  try {
    const newSubject = await Subject.create(req.body);
    return res.status(201).json(newSubject);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find().populate("educationalSystem");
    return res.json(subjects);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await Subject.findById(id).populate("educationalSystem");
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }
    return res.json(subject);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Subject.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Subject not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Subject.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Subject not found" });
    }
    return res.json({ message: "Subject deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};