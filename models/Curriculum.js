const mongoose = require("mongoose");

const curriculumSchema = new mongoose.Schema(
  {
    educationalSystem: { type: mongoose.Schema.Types.ObjectId, ref: "EducationalSystem", required: true },
    gradeLevel: { type: String, required: true }, // Ví dụ: "Lớp 10"
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
    description: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Curriculum", curriculumSchema);