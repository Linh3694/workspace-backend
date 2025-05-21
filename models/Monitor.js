const mongoose = require("mongoose");

const assignmentHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: { type: String },
  jobTitle: { type: String },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  notes: { type: String },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Người bàn giao
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Người thu hồi
  revokedReason: { type: [String], default: [] }, // Lưu danh sách lý do thu hồi
  document: { type: String }, // Đường dẫn file biên bản
  });


const monitorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  manufacturer: { type: String,},
  serial: { type: String, required: true },
  releaseYear: { type: Number },
  assigned: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // Thêm mảng ghi lại lịch sử bàn giao:
  assignmentHistory: [assignmentHistorySchema],
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" }, // Gán phòng
  status: { type: String, enum: ["Active", "Standby", "Broken", "PendingDocumentation"] },
  brokenReason: {
    type: String,
    default: null, // Hoặc "" nếu muốn lưu chuỗi rỗng mặc định
  },
  specs: {
    processor: { type: String },
    ram: { type: String },
    storage: { type: String },
    display: { type: String }
  },
},{ timestamps: true });


module.exports = mongoose.model("Monitor", monitorSchema);