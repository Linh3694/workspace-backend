const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    schoolYear: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolYear", required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    type: { type: String, enum: ["academic", "attendance", "summary"], required: true },
    data: { type: Object }, // JSON tùy chỉnh
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);