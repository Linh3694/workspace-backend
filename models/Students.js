const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    studentCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    gender: { type: String, enum: ["Nam", "Nữ", "Khác"] },
    birthDate: { type: Date },
    email: { type: String },
    address: { type: String }, // Địa chỉ học sinh (tuyển sinh)
    phone: { type: String }, // Số điện thoại (optional, hỗ trợ liên lạc)
    parents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Parent" }], // Thay hoặc bổ sung cho  Family, liên kết trực tiếp với phụ huynh
    status: { type: String, enum: ["active", "inactive", "graduated"] }, // Trạng thái học sinh
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);