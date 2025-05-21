const mongoose = require("mongoose");

const schoolYearSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, 
    // Ví dụ "2023-2024"

    startDate: { type: Date, required: true }, 
    // Ví dụ 01-07-2023

    endDate: { type: Date, required: true },
    // Ví dụ 30-06-2024

    description: { type: String },

    isActive: { type: Boolean, default: false }, // Đánh dấu năm học hiện tại
  },
  { timestamps: true }
);

module.exports = mongoose.model("SchoolYear", schoolYearSchema);