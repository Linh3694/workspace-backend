const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// TimetableSchedule Model - Quản lý thời khoá biểu với khoảng thời gian
const TimetableScheduleSchema = new Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  schoolYear: { 
    type: Schema.Types.ObjectId, 
    ref: "SchoolYear", 
    required: true 
  },
  class: { 
    type: Schema.Types.ObjectId, 
    ref: "Class", 
    required: true 
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["active", "inactive"], 
    default: "active" 
  },
  fileUrl: { 
    type: String 
  },
  fileName: { 
    type: String 
  },
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: "Users" 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
});

// Index để tối ưu query
TimetableScheduleSchema.index({ schoolYear: 1, class: 1 });
TimetableScheduleSchema.index({ startDate: 1, endDate: 1 });

// Pre-save middleware để validate
TimetableScheduleSchema.pre('save', function(next) {
  // Kiểm tra ngày kết thúc phải sau ngày bắt đầu
  if (this.startDate >= this.endDate) {
    return next(new Error('Ngày kết thúc phải sau ngày bắt đầu'));
  }
  
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("TimetableSchedule", TimetableScheduleSchema); 