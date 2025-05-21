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
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomEmoji"
    },
    emojiType: {
      type: String
    },
    emojiName: {
      type: String
    },
    emojiUrl: {
      type: String
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);