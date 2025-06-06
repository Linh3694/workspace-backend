const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Class Model
const ClassSchema = new Schema({
  className: { type: String, required: true },
  gradeLevel: { type: Schema.Types.ObjectId, ref: "GradeLevel", required: true },
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  educationalSystem: { type: Schema.Types.ObjectId, ref: "EducationalSystem" },
  curriculum: { type: Schema.Types.ObjectId, ref: "Curriculum" },
  homeroomTeachers: [{ type: Schema.Types.ObjectId, ref: "Teacher" }],
  students: [{ type: Schema.Types.ObjectId, ref: "Student" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Class", ClassSchema); 