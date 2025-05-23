const mongoose = require("mongoose");

const customEmojiSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['gif', 'static', 'unicode'],
        default: 'static'
    },
    path: {
        type: String,
        required: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    category: {
        type: String,
        default: 'custom'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("CustomEmoji", customEmojiSchema);
