const mongoose = require('mongoose');

const libraryActivitySchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  date: { 
    type: Date, 
    required: true 
  },
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