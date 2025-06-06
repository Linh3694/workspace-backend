const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// SchoolYear Model
const SchoolYearSchema = new Schema({
  code: { type: String, required: true, unique: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index để tối ưu hiệu suất
SchoolYearSchema.index({ code: 1 });
SchoolYearSchema.index({ isActive: 1 });
SchoolYearSchema.index({ startDate: 1, endDate: 1 });
SchoolYearSchema.index({ createdAt: -1 });

// Middleware: Cập nhật updatedAt mỗi khi lưu
SchoolYearSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware: Đảm bảo chỉ có một năm học active
SchoolYearSchema.pre("save", async function (next) {
  if (this.isActive && this.isModified('isActive')) {
    // Nếu đang set isActive = true, thì set tất cả các năm học khác về false
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { $set: { isActive: false } }
    );
  }
  next();
});

// Virtual để tính duration (số ngày)
SchoolYearSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    const diffTime = this.endDate - this.startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
  return 0;
});

// Virtual để kiểm tra năm học hiện tại có đang diễn ra không
SchoolYearSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.startDate <= now && now <= this.endDate;
});

// Virtual để lấy tên năm học (ví dụ: "2023-2024")
SchoolYearSchema.virtual('displayName').get(function() {
  if (this.startDate && this.endDate) {
    const startYear = this.startDate.getFullYear();
    const endYear = this.endDate.getFullYear();
    return `${startYear}-${endYear}`;
  }
  return this.code;
});

// Method để kích hoạt năm học này
SchoolYearSchema.methods.activate = async function() {
  // Deactivate tất cả các năm học khác
  await this.constructor.updateMany(
    { _id: { $ne: this._id } },
    { $set: { isActive: false } }
  );
  
  // Activate năm học này
  this.isActive = true;
  return this.save();
};

// Method để deactivate năm học này
SchoolYearSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Method để kiểm tra date có nằm trong năm học không
SchoolYearSchema.methods.containsDate = function(date) {
  const checkDate = new Date(date);
  return this.startDate <= checkDate && checkDate <= this.endDate;
};

// Method để lấy semester dựa trên date
SchoolYearSchema.methods.getSemesterByDate = function(date) {
  if (!this.containsDate(date)) {
    return null;
  }
  
  const checkDate = new Date(date);
  const totalDuration = this.endDate - this.startDate;
  const passedDuration = checkDate - this.startDate;
  
  // Nếu chưa qua nửa năm học thì là học kỳ 1, ngược lại là học kỳ 2
  return passedDuration < (totalDuration / 2) ? '1' : '2';
};

// Static method để lấy năm học hiện tại đang active
SchoolYearSchema.statics.getActiveSchoolYear = function() {
  return this.findOne({ isActive: true });
};

// Static method để lấy năm học theo code
SchoolYearSchema.statics.findByCode = function(code) {
  return this.findOne({ code });
};

// Static method để lấy năm học theo khoảng thời gian
SchoolYearSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    $or: [
      // Năm học bắt đầu trong khoảng thời gian
      { startDate: { $gte: startDate, $lte: endDate } },
      // Năm học kết thúc trong khoảng thời gian
      { endDate: { $gte: startDate, $lte: endDate } },
      // Năm học bao trùm khoảng thời gian
      { startDate: { $lte: startDate }, endDate: { $gte: endDate } }
    ]
  });
};

// Static method để lấy năm học chứa date cụ thể
SchoolYearSchema.statics.findByDate = function(date) {
  const checkDate = new Date(date);
  return this.find({
    startDate: { $lte: checkDate },
    endDate: { $gte: checkDate }
  });
};

// Static method để lấy các năm học sắp tới
SchoolYearSchema.statics.getUpcomingSchoolYears = function(limit = 5) {
  const now = new Date();
  return this.find({
    startDate: { $gt: now }
  })
  .sort({ startDate: 1 })
  .limit(limit);
};

// Static method để lấy các năm học đã qua
SchoolYearSchema.statics.getPastSchoolYears = function(limit = 5) {
  const now = new Date();
  return this.find({
    endDate: { $lt: now }
  })
  .sort({ endDate: -1 })
  .limit(limit);
};

// Static method để validation khi tạo năm học mới
SchoolYearSchema.statics.validateNewSchoolYear = async function(startDate, endDate, excludeId = null) {
  const query = {
    $or: [
      // Overlap với năm học khác
      { startDate: { $lt: endDate }, endDate: { $gt: startDate } }
    ]
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const overlapping = await this.findOne(query);
  
  if (overlapping) {
    throw new Error(`Năm học bị trùng lặp với năm học ${overlapping.code} (${overlapping.displayName})`);
  }
  
  // Kiểm tra logic thời gian
  if (startDate >= endDate) {
    throw new Error('Ngày bắt đầu phải nhỏ hơn ngày kết thúc');
  }
  
  return true;
};

// Static method để lấy thống kê
SchoolYearSchema.statics.getStatistics = async function() {
  const now = new Date();
  
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalSchoolYears: { $sum: 1 },
        activeSchoolYears: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] }
        },
        currentSchoolYears: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lte: ["$startDate", now] },
                  { $gte: ["$endDate", now] }
                ]
              },
              1,
              0
            ]
          }
        },
        upcomingSchoolYears: {
          $sum: { $cond: [{ $gt: ["$startDate", now] }, 1, 0] }
        },
        pastSchoolYears: {
          $sum: { $cond: [{ $lt: ["$endDate", now] }, 1, 0] }
        },
        avgDuration: {
          $avg: {
            $divide: [
              { $subtract: ["$endDate", "$startDate"] },
              1000 * 60 * 60 * 24 // Convert to days
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalSchoolYears: 0,
    activeSchoolYears: 0,
    currentSchoolYears: 0,
    upcomingSchoolYears: 0,
    pastSchoolYears: 0,
    avgDuration: 0
  };
};

const SchoolYear = mongoose.model("SchoolYear", SchoolYearSchema);

module.exports = SchoolYear; 