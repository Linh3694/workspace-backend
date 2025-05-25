const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        required: true
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    },
    pinnedMessages: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

chatSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Thêm indexes để tối ưu performance
chatSchema.index({ participants: 1 }); // Tìm chat theo participants
chatSchema.index({ participants: 1, lastMessage: 1 }); // Lấy chat có tin nhắn
chatSchema.index({ updatedAt: -1 }); // Sắp xếp theo thời gian cập nhật
chatSchema.index({ "participants": 1, "updatedAt": -1 }); // Compound index cho getUserChats

module.exports = mongoose.model("Chat", chatSchema);