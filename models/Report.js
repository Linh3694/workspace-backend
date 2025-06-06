const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Report Model
const ReportSchema = new Schema({
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  type: { type: String, enum: ["semester", "year", "attendance", "custom"], required: true },
  data: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Report", ReportSchema);