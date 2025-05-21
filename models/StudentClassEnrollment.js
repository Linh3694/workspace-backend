const mongoose = require("mongoose");

const studentClassEnrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolYear",
      required: true
    },
    status: { type: String, enum: ["active", "transferred", "dropped"] }, // Trạng thái trong lớp
    
    startDate: { type: Date },
    endDate: { type: Date },

    // Tuỳ bạn thêm fields: "grade", "ranking", "score", ...
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentClassEnrollment", studentClassEnrollmentSchema);