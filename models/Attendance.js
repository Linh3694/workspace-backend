const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent", "late"], required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    note: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);