const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Tải biến môi trường
dotenv.config();

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory')
    .then(() => console.log('Đã kết nối với MongoDB'))
    .catch(err => {
        console.error('Lỗi kết nối MongoDB:', err);
        process.exit(1);
    });

// Định nghĩa model CustomEmoji
const CustomEmoji = mongoose.model('CustomEmoji', new mongoose.Schema({
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
    url: {
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
}));

async function updateEmojiPaths() {
    try {
        // Tìm tất cả emoji có đường dẫn cũ
        const emojis = await CustomEmoji.find({
            url: { $regex: '^/uploads/Emoji/' }
        });

        console.log(`Tìm thấy ${emojis.length} emoji cần cập nhật đường dẫn`);

        // Cập nhật từng emoji
        let updatedCount = 0;
        for (const emoji of emojis) {
            // Thay đổi đường dẫn từ /uploads/Emoji/ thành /assests/Emoji/
            const newUrl = emoji.url.replace('/uploads/Emoji/', '/assests/Emoji/');

            await CustomEmoji.updateOne(
                { _id: emoji._id },
                { $set: { url: newUrl } }
            );

            console.log(`Đã cập nhật emoji ${emoji.name}: ${emoji.url} -> ${newUrl}`);
            updatedCount++;
        }

        console.log(`Hoàn tất: Đã cập nhật ${updatedCount} emoji`);
    } catch (error) {
        console.error('Lỗi khi cập nhật đường dẫn emoji:', error);
    } finally {
        // Đóng kết nối MongoDB sau khi hoàn tất
        mongoose.connection.close();
    }
}

// Chạy hàm cập nhật
updateEmojiPaths(); 