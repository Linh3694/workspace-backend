// backend/models/Post.js
const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  reactions: [reactionSchema],
  // Thêm support cho replies (nested comments)
  parentComment: { type: mongoose.Schema.Types.ObjectId, default: null },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  // Đánh dấu comment đã bị xóa
  isDeleted: { type: Boolean, default: false }
});

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },

    // Lưu đường dẫn tới file upload hoặc URL
    images: [{ type: String }],
    videos: [{ type: String }],

    // Kiểu bài viết
    type: {
      type: String,
      enum: ['Thông báo', 'Chia sẻ', 'Câu hỏi', 'Badge', 'Khác'],
      default: 'Chia sẻ',
    },

    // Quyền xem: public hoặc theo phòng ban
    visibility: {
      type: String,
      enum: ['public', 'department'],
      default: 'public',
    },

    // Nếu visibility = department, thì gán phòng ban tại đây
    department: { type: String },

    // Tag người dùng khác
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Dùng cho tính năng huy hiệu
    badgeInfo: {
      badgeName: { type: String },
      badgeIcon: { type: String }, // Có thể lưu link icon
      message: { type: String },
    },
    isPinned: { type: Boolean, default: false },
    comments: [commentSchema],
    reactions: [reactionSchema],
  },
  { timestamps: true } // Tự sinh createdAt, updatedAt
);

module.exports = mongoose.model('Post', postSchema);