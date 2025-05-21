const mongoose = require("mongoose");

/**
 * Mô hình để lưu ảnh. 
 * Giờ có thêm field "class" để lưu ảnh của lớp theo năm học.
 */
const photoSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      // Bỏ `required: true` để tùy trường hợp:
      // 1) Ảnh học sinh => student != null
      // 2) Ảnh lớp => student có thể là null
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      // Tương tự, có thể null nếu là ảnh cá nhân
    },
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolYear",
      required: true, // Ảnh luôn gắn với 1 năm học
    },
    photoUrl: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Photo", photoSchema);