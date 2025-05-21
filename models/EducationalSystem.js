const mongoose = require("mongoose");

const educationalSystemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Ví dụ: "Vietnam", "IB"
    description: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EducationalSystem", educationalSystemSchema);