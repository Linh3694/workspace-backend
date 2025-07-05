const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// SchoolYearEvent Model
const SchoolYearEventSchema = new Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  description: { type: String },
  type: { 
    type: String, 
    enum: ["holiday", "event", "exam"], 
    required: true,
    default: "event"
  },
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index để tối ưu hiệu suất
SchoolYearEventSchema.index({ schoolYear: 1 });
SchoolYearEventSchema.index({ startDate: 1, endDate: 1 });
SchoolYearEventSchema.index({ type: 1 });
SchoolYearEventSchema.index({ createdAt: -1 });

// Middleware: Cập nhật updatedAt mỗi khi lưu
SchoolYearEventSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual để tính duration (số ngày)
SchoolYearEventSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    const diffTime = this.endDate - this.startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
  return 0;
});

// Method để kiểm tra date có nằm trong sự kiện không
SchoolYearEventSchema.methods.containsDate = function(date) {
  const checkDate = new Date(date);
  return this.startDate <= checkDate && checkDate <= this.endDate;
};

// Static method để lấy sự kiện theo năm học
SchoolYearEventSchema.statics.findBySchoolYear = function(schoolYearId) {
  return this.find({ schoolYear: schoolYearId }).sort({ startDate: 1 });
};

// Static method để lấy sự kiện theo khoảng thời gian
SchoolYearEventSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    $or: [
      // Sự kiện bắt đầu trong khoảng thời gian
      { startDate: { $gte: startDate, $lte: endDate } },
      // Sự kiện kết thúc trong khoảng thời gian
      { endDate: { $gte: startDate, $lte: endDate } },
      // Sự kiện bao trùm khoảng thời gian
      { startDate: { $lte: startDate }, endDate: { $gte: endDate } }
    ]
  });
};

// Static method để lấy sự kiện theo loại
SchoolYearEventSchema.statics.findByType = function(type) {
  return this.find({ type }).sort({ startDate: 1 });
};

// Static method để lấy sự kiện theo tháng
SchoolYearEventSchema.statics.findByMonth = function(year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  
  return this.find({
    $or: [
      { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
      { endDate: { $gte: startOfMonth, $lte: endOfMonth } },
      { startDate: { $lte: startOfMonth }, endDate: { $gte: endOfMonth } }
    ]
  });
};

const SchoolYearEvent = mongoose.model("SchoolYearEvent", SchoolYearEventSchema);

module.exports = SchoolYearEvent; 