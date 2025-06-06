const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// School Model
const SchoolSchema = new Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, unique: true },
  description: { type: String },
  gradeLevels: [{ type: Schema.Types.ObjectId, ref: "GradeLevel" }],
  educationalSystems: [{ type: Schema.Types.ObjectId, ref: "EducationalSystem" }],
  curriculums: [{ type: Schema.Types.ObjectId, ref: "Curriculum" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("School", SchoolSchema); 