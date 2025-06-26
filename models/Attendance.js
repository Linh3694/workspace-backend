const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Attendance Model
const AttendanceSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ["present", "absent", "late", "excused"], required: true },
  note: { type: String },
  checkIn: { type: String },   // time string e.g. "08:00"
  checkOut: { type: String },  // time string e.g. "16:00"
  
  // Liên kết với đơn xin nghỉ phép (nếu có)
  leaveRequest: { type: Schema.Types.ObjectId, ref: "LeaveRequest" },
  
  // Loại nghỉ (áp dụng khi status = "excused" hoặc "absent")
  absenceType: { type: String, enum: ["full_day", "morning", "afternoon"] },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Attendance", AttendanceSchema);