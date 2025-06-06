const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Grade Model
const GradeSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  semester: { type: String, enum: ["1", "2"], required: true },
  score: { type: Number, required: true },
  type: { type: String, enum: ["quiz", "midterm", "final", "assignment"], required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Grade", GradeSchema); 