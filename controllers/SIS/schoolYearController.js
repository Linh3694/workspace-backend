// controllers/schoolYearController.js
const SchoolYear = require("../../models/SchoolYear");

exports.createSchoolYear = async (req, res) => {
  try {
    const newSY = await SchoolYear.create(req.body);
    return res.status(201).json(newSY);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getAllSchoolYears = async (req, res) => {
  try {
    const result = await SchoolYear.find();
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getSchoolYearById = async (req, res) => {
  try {
    const { id } = req.params;
    const sy = await SchoolYear.findById(id);
    if (!sy) {
      return res.status(404).json({ message: "SchoolYear not found" });
    }
    return res.json(sy);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.updateSchoolYear = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await SchoolYear.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "SchoolYear not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.deleteSchoolYear = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SchoolYear.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "SchoolYear not found" });
    }
    return res.json({ message: "SchoolYear deleted" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};