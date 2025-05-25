const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users"
  },
  emojiCode: String,
  isCustom: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "multiple-images"],
      default: "text",
    },
    // Forwarding related fields
    isForwarded: {
      type: Boolean,
      default: false
    },
    originalMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    },
    originalSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users"
    },
    // Sticker / custom emoji metadata
    isEmoji: {
      type: Boolean,
      default: false
    },
    emojiId: {
      type: String,
      required: function() {
        return this.isEmoji === true;
      }
    },
    emojiType: {
      type: String,
      required: function() {
        return this.isEmoji === true;
      }
    },
    emojiName: {
      type: String,
      required: function() {
        return this.isEmoji === true;
      }
    },
    emojiUrl: {
      type: String,
      required: function() {
        return this.isEmoji === true;
      }
    },
    fileUrl: {
      type: String,
    },
    fileUrls: {
      type: [String],
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
      },
    ],
    reactions: [reactionSchema],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    // Thêm trường cho tính năng ghim tin nhắn
    isPinned: {
      type: Boolean,
      default: false
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users"
    },
    pinnedAt: {
      type: Date
    },
    isRevoked: { type: Boolean, default: false },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

messageSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Thêm indexes để tối ưu performance
messageSchema.index({ chat: 1, createdAt: -1 }); // Lấy tin nhắn theo chat và thời gian
messageSchema.index({ chat: 1, createdAt: 1 }); // Ascending order cho pagination
messageSchema.index({ sender: 1, createdAt: -1 }); // Tin nhắn theo người gửi
messageSchema.index({ readBy: 1 }); // Trạng thái đã đọc
messageSchema.index({ replyTo: 1 }); // Tin nhắn reply
messageSchema.index({ isPinned: 1, chat: 1 }); // Tin nhắn ghim
messageSchema.index({ "reactions.user": 1 }); // Reactions của user

module.exports = mongoose.model("Message", messageSchema);