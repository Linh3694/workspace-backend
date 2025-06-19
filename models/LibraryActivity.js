const mongoose = require('mongoose');

const libraryActivitySchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  days: [{
    dayNumber: { type: Number, required: true },
    date: { type: Date, required: true },
    title: { type: String, default: '' }, // Tiêu đề cho ngày cụ thể (ví dụ: "Ngày 1 - Khai mạc")
    description: { type: String, default: '' },
    isPublished: { type: Boolean, default: true }, // Trạng thái xuất bản của từng ngày
    images: [{
      url: { type: String, required: true },
      caption: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }]
  }],
  // Giữ lại date cũ để backward compatibility và để sort theo ngày bắt đầu
  date: { 
    type: Date, 
    required: true 
  },
  // Giữ lại images cũ để backward compatibility
  images: [{
    url: { type: String, required: true },
    caption: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  isPublished: { 
    type: Boolean, 
    default: true 
  },
  createdBy: { 
    type: String,
    required: true
  }
}, { 
  timestamps: true 
});

// Index cho tìm kiếm và sắp xếp
libraryActivitySchema.index({ title: 'text' });
libraryActivitySchema.index({ date: -1 });
libraryActivitySchema.index({ createdAt: -1 });

// Virtual cho việc format ngày
libraryActivitySchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('vi-VN');
});

module.exports = mongoose.model('LibraryActivity', libraryActivitySchema); 