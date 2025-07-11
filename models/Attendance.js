const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Attendance Model
const AttendanceSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
  date: { type: Date, required: true },
  
  // ✅ THÊM: Thông tin tiết học
  periodNumber: { type: Number, required: true, min: 1, max: 10 }, // Tiết thứ mấy (1-10)
  periodStartTime: { type: String, required: true }, // Thời gian bắt đầu tiết
  periodEndTime: { type: String, required: true },   // Thời gian kết thúc tiết
  
  // ✅ THÊM: Thông tin môn học từ timetable
  subject: { type: Schema.Types.ObjectId, ref: "Subject" },
  timetableSlot: { type: Schema.Types.ObjectId, ref: "Timetable" }, // Liên kết với slot timetable
  
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

// ✅ THÊM: Compound index để tối ưu query và đảm bảo unique
AttendanceSchema.index({ 
  class: 1, 
  date: 1, 
  periodNumber: 1, 
  student: 1 
}, { unique: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);