const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    className: { type: String, required: true }, 
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolYear",
      required: true
    },
    homeroomTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Users" }], 
    educationalSystem: { type: mongoose.Schema.Types.ObjectId, ref: "EducationalSystem" }, // Hệ học
    gradeLevel: { type: String }, // Ví dụ: "Lớp 10", "Grade 11"
    curriculum: { type: mongoose.Schema.Types.ObjectId, ref: "Curriculum" }, // Giáo trình
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }], // Danh sách học sinh (optional)
},
  { timestamps: true }
);

classSchema.index({ className: 1, schoolYear: 1 }, { unique: true });


module.exports = mongoose.model("Class", classSchema);