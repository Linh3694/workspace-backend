const express = require("express");
const router = express.Router();
const educationalSystemController = require("../../controllers/SIS/educationalSystemController");

// GET /api/educational-systems - Get all educational systems
router.get("/", educationalSystemController.getAllEducationalSystems);

// GET /api/educational-systems/school/:schoolId - Get educational systems by school
router.get("/school/:schoolId", educationalSystemController.getEducationalSystemsBySchool);

// GET /api/educational-systems/:id - Get educational system by ID
router.get("/:id", educationalSystemController.getEducationalSystemById);

// POST /api/educational-systems - Create new educational system
router.post("/", educationalSystemController.createEducationalSystem);

// PUT /api/educational-systems/:id - Update educational system
router.put("/:id", educationalSystemController.updateEducationalSystem);

// DELETE /api/educational-systems/:id - Delete educational system
router.delete("/:id", educationalSystemController.deleteEducationalSystem);

module.exports = router;