const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    ten: {
      type: String,
      required: true,
    },
    loai: {
      type: String,
      enum: ["Tờ Trình/PR", "Biên bản", "Hợp đồng", "Hoàn công"],
      required: true,
    },
    phongBan: {
      type: String,
      required: true,
    },
    ngayTao: {
      type: Date,
      default: Date.now,
    },
    nguoiTao: {
      type: String,
      default: "",
    },
    trangThai: {
      type: String,
      enum: ["Đang xử lý", "Hoàn thành", "Hủy"],
      default: "Đang xử lý",
    },
    chiPhi: {
      type: Number,
      default: 0,
    },
    thangSuDung: { 
      type: String, 
      required: true },
    file: {
      // Lưu đường dẫn file trên server
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);