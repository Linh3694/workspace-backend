const express = require("express");
const router = express.Router();
const Photo = require("../../models/Photo");
const { authenticateToken, isAdmin } = require("../../middleware/auth");

// GET all photos
router.get("/", authenticateToken, async (req, res) => {
  try {
    const photos = await Photo.find();
    res.json(photos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET photo by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }
    res.json(photo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create photo
router.post("/", authenticateToken, async (req, res) => {
  try {
    const photo = new Photo(req.body);
    await photo.save();
    res.status(201).json(photo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update photo
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const photo = await Photo.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }
    res.json(photo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE photo
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const photo = await Photo.findByIdAndDelete(req.params.id);
    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }
    res.json({ message: "Photo deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 