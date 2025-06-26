const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

// Leave Request Model
const LeaveRequestSchema = new Schema({
  student: { 
    type: Schema.Types.ObjectId, 
    ref: "Student", 
    required: true 
  },
  
  // Lý do xin nghỉ
  reason: { 
    type: String, 
    enum: ["sick", "family", "bereavement", "other"], 
    required: true 
  },
  
  // Mô tả chi tiết lý do
  description: { 
    type: String, 
    required: true 
  },
  
  // Ngày bắt đầu nghỉ
  startDate: { 
    type: Date, 
    required: true 
  },
  
  // Ngày kết thúc nghỉ
  endDate: { 
    type: Date, 
    required: true 
  },
  
  // Loại nghỉ: full_day (cả ngày), morning (sáng), afternoon (chiều)
  // Chỉ áp dụng khi startDate = endDate (nghỉ 1 ngày)
  leaveType: { 
    type: String, 
    enum: ["full_day", "morning", "afternoon"], 
    default: "full_day" 
  },
  
  // File đính kèm
  attachments: [{
    fileName: { type: String },
    fileUrl: { type: String },
    fileType: { type: String }, // image, pdf, doc, etc.
    fileSize: { type: Number } // in bytes
  }],
  
  // Thông tin liên hệ
  contactInfo: { 
    type: String 
  },
  
  // Trạng thái đơn xin nghỉ
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected"], 
    default: "pending" 
  },
  
  // Ghi chú từ giáo viên/admin khi duyệt
  approvalNote: { 
    type: String 
  },
  
  // Người duyệt đơn
  approvedBy: { 
    type: Schema.Types.ObjectId, 
    ref: "Teacher" 
  },
  
  // Ngày duyệt
  approvedAt: { 
    type: Date 
  },
  
  // Người tạo đơn (phụ huynh)
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: "Parent",
    required: true 
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Middleware để tự động update updatedAt
LeaveRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual để tính số ngày nghỉ
LeaveRequestSchema.virtual('leaveDays').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
});

// Method để kiểm tra xem có phải nghỉ 1 ngày không
LeaveRequestSchema.methods.isSingleDay = function() {
  return this.startDate.toDateString() === this.endDate.toDateString();
};

// Method để lấy tên lý do bằng tiếng Việt
LeaveRequestSchema.methods.getReasonText = function() {
  const reasonMap = {
    'sick': 'Con bị ốm',
    'family': 'Gia đình có việc bận',
    'bereavement': 'Gia đình có việc hiếu',
    'other': 'Lý do khác'
  };
  return reasonMap[this.reason] || this.reason;
};

// Method để lấy text loại nghỉ
LeaveRequestSchema.methods.getLeaveTypeText = function() {
  const typeMap = {
    'full_day': 'Cả ngày',
    'morning': 'Buổi sáng',
    'afternoon': 'Buổi chiều'
  };
  return typeMap[this.leaveType] || this.leaveType;
};

// Add pagination plugin
LeaveRequestSchema.plugin(mongoosePaginate);

// Index cho tìm kiếm
LeaveRequestSchema.index({ student: 1, startDate: 1 });
LeaveRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("LeaveRequest", LeaveRequestSchema); 