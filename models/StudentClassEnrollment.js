const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// StudentClassEnrollment Model
const StudentClassEnrollmentSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  status: { type: String, enum: ["active", "transferred", "dropped"], default: "active" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Prevent duplicate enrollments per student per schoolYear
StudentClassEnrollmentSchema.index(
  { student: 1, schoolYear: 1 },
  { unique: true }
);

// Prevent duplicate enrollments per student per class per schoolYear
StudentClassEnrollmentSchema.index(
  { student: 1, class: 1, schoolYear: 1 },
  { unique: true }
);

module.exports = mongoose.model("StudentClassEnrollment", StudentClassEnrollmentSchema); 