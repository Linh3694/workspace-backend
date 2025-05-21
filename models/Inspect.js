const mongoose = require('mongoose');

const InspectSchema = new mongoose.Schema({
  laptopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Laptop', required: true },
  inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inspectionDate: { type: Date, default: Date.now },
  results: {
    externalCondition: {
      overallCondition: { type: String, default: "" }, // Ví dụ: Tốt, Bình thường, Kém
      notes: { type: String, default: "" }, // Ghi chú chi tiết cho mục này
    },
    cpu: {
      performance: String,
      temperature: String,
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    ram: {
      consumption: String,
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    storage: {
      remainingCapacity: String,
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    battery: {
      capacity: Number,
      performance: Number,
      chargeCycles: Number,
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    display: {
      isStriped: { type: Boolean, default: false },
      hasDeadPixels: { type: Boolean, default: false },
      colorAndBrightness: { type: String, default: "" },
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    connectivity: {
      Wifi: { type: Boolean, default: false },
      Bluetooth: { type: Boolean, default: false },
      USB: { type: Boolean, default: false },
      HDMI: { type: Boolean, default: false },
      Ethernet: { type: Boolean, default: false },
      Micro: { type: Boolean, default: false },
      Loa: { type: Boolean, default: false },
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    software: {
      "Kiểm tra hệ điều hành": { type: Boolean, default: false },
      "Cập nhật bản vá": { type: Boolean, default: false },
      "Tắt Windows Updates": { type: Boolean, default: false },
      overallCondition: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
  },
  passed: { type: Boolean, default: true },
  recommendations: String,
  technicalConclusion: { type: String, default: "" },
  followUpRecommendation: { type: String, default: "" },
  report: {
    fileName: String,
    filePath: String,
    createdAt: { type: Date, default: Date.now },
  },
});

module.exports = mongoose.model('Inspect', InspectSchema);