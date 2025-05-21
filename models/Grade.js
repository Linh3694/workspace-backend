const mongoose = require("mongoose");

const gradeSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Students", required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    schoolYear: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolYear", required: true },
    semester: { type: String, required: true },
    score: { type: Number, required: true },
    type: { type: String, enum: ["midterm", "final", "assignment"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Grade", gradeSchema);