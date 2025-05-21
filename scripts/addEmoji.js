const fs = require('fs');
const path = require('path');
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

// Định nghĩa model CustomEmoji nếu chưa có
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

const emojiFolder = path.join(__dirname, '../assests/Emoji');

// Ánh xạ tên file với tên và category
const emojiMapping = {
    'clapping_hands.gif': { name: 'Vỗ tay', code: 'clap', category: 'reactions' },
    'grinning_squinting_face.gif': { name: 'Cười', code: 'laugh', category: 'reactions' },
    'loudly_crying_face.gif': { name: 'Khóc', code: 'cry', category: 'reactions' },
    'hushed_face.gif': { name: 'Ngạc nhiên', code: 'wow', category: 'reactions' },
    'smiling_face_with_heart_eyes.gif': { name: 'Trái tim', code: 'heart', category: 'reactions' }
};

async function importEmojis() {
    try {
        // Đọc danh sách file trong thư mục
        const files = fs.readdirSync(emojiFolder);

        console.log(`Tìm thấy ${files.length} file trong thư mục ${emojiFolder}`);

        // Đếm số emoji đã thêm
        let addedCount = 0;
        let skippedCount = 0;

        // Xử lý từng file
        for (const file of files) {
            // Bỏ qua các file không phải ảnh
            if (!file.match(/\.(jpg|jpeg|png|gif)$/i)) {
                console.log(`Bỏ qua file không phải ảnh: ${file}`);
                continue;
            }

            // Kiểm tra xem file có nằm trong mapping không
            const emojiInfo = emojiMapping[file] || {
                name: file.replace(/\.[^/.]+$/, '').replace(/_/g, ' '), // Xóa extension và thay _ bằng space
                code: file.replace(/\.[^/.]+$/, '').toLowerCase(), // Xóa extension và chuyển thành lowercase
                category: 'custom'
            };

            // Đường dẫn URL của file
            const url = `/assests/Emoji/${file}`;

            // Kiểm tra xem emoji đã tồn tại chưa
            const existingEmoji = await CustomEmoji.findOne({ code: emojiInfo.code });

            if (existingEmoji) {
                console.log(`Emoji với mã '${emojiInfo.code}' đã tồn tại, bỏ qua.`);
                skippedCount++;
                continue;
            }

            // Thêm emoji mới vào database
            const type = file.endsWith('.gif') ? 'gif' : 'static';

            const newEmoji = new CustomEmoji({
                name: emojiInfo.name,
                code: emojiInfo.code,
                type: type,
                url: url,
                isDefault: true,
                category: emojiInfo.category
            });

            await newEmoji.save();
            console.log(`Đã thêm emoji: ${emojiInfo.name} (${file})`);
            addedCount++;
        }

        console.log(`Hoàn tất: Đã thêm ${addedCount} emoji, bỏ qua ${skippedCount} emoji.`);
    } catch (error) {
        console.error('Lỗi khi import emoji:', error);
    } finally {
        // Đóng kết nối MongoDB sau khi hoàn tất
        mongoose.connection.close();
    }
}

// Chạy hàm import
importEmojis();
