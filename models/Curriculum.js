const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Curriculum Model
const CurriculumSchema = new Schema({
  name: { type: String, required: true },
  educationalSystem: { type: Schema.Types.ObjectId, ref: "EducationalSystem", required: true },
  gradeLevel: { type: String },
  subjects: [{
    subject: { type: Schema.Types.ObjectId, ref: "Subject" },
  }],
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Curriculum", CurriculumSchema); 