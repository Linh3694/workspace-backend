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

const phoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, default: 'Phone' }, // Phân loại điện thoại
  manufacturer: { type: String },
  serial: { type: String, required: true },
  imei1: { type: String, required: true }, // IMEI 1
  imei2: { type: String }, // IMEI 2 (optional cho dual sim)
  phoneNumber: { type: String }, // Số điện thoại
  releaseYear: { type: Number },
  assigned: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // Thêm mảng ghi lại lịch sử bàn giao:
  assignmentHistory: [assignmentHistorySchema],
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" }, // Gán phòng
  status: { type: String, enum: ["Active", "Standby", "Broken", "PendingDocumentation"] },
  brokenReason: {
    type: String,
    default: null,
  },
  specs: {
    processor: { type: String }, // CPU
    ram: { type: String }, // RAM
    storage: { type: String }, // Ổ cứng
    display: { type: String } // Màn hình
  },
}, { timestamps: true });

module.exports = mongoose.model("Phone", phoneSchema); 