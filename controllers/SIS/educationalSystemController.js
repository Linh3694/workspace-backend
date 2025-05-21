// controllers/educationalSystemController.js
const EducationalSystem = require("../../models/EducationalSystem");

// CRUD cơ bản
exports.createEducationalSystem = async (req, res) => {
  try {
    const newSystem = await EducationalSystem.create(req.body);
    return res.status(201).json(newSystem);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getAllEducationalSystems = async (req, res) => {
  try {
    const systems = await EducationalSystem.find();
    return res.json(systems);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getEducationalSystemById = async (req, res) => {
  try {
    const { id } = req.params;
    const system = await EducationalSystem.findById(id);
    if (!system) {
      return res.status(404).json({ message: "EducationalSystem not found" });
    }
    return res.json(system);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.updateEducationalSystem = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await EducationalSystem.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "EducationalSystem not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.deleteEducationalSystem = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await EducationalSystem.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "EducationalSystem not found" });
    }
    return res.json({ message: "EducationalSystem deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};