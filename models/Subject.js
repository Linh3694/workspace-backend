const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    educationalSystem: { type: mongoose.Schema.Types.ObjectId, ref: "EducationalSystem", required: true },
    name: { type: String, required: true }, 
    code: { type: String }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subject", subjectSchema);