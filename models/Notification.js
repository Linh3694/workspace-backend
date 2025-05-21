const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        body: {
            type: String,
            required: true,
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        read: {
            type: Boolean,
            default: false,
        },
        type: {
            type: String,
            enum: ["ticket", "chat", "system"],
            default: "system",
        },
    },
    { timestamps: true }
);

// Đảm bảo có index cho việc tìm kiếm nhanh
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema); 