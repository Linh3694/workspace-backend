const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  entityType: { type: String, required: true }, // Loại entity (VD: 'laptop', 'user', 'room', ...)
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ID của entity
  type: { type: String, enum: ['repair', 'update'], required: true },
  description: { type: String, required: true },
  details: { type: String },
  date: { type: Date, required: true, default: Date.now }, // Thời gian mặc định
  updatedBy: { type: String }, // Người thực hiện
},{ timestamps: true } );

module.exports = mongoose.model('Activity', activitySchema);