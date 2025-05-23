const mongoose = require('mongoose');
const CustomEmoji = require('../workspace-backend/models/CustomEmoji');

// Thay đổi chuỗi kết nối cho phù hợp với môi trường của bạn
const MONGO_URI = 'mongodb://app:wellspring@172.16.20.130:27017/workspace?authSource=workspace';

async function migrateEmojiPath() {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    // Tìm các emoji có trường url nhưng chưa có path
    const emojis = await CustomEmoji.find({ url: { $exists: true }, path: { $exists: false } });

    for (const emoji of emojis) {
        emoji.path = emoji.url; // copy giá trị từ url sang path
        await emoji.save();
        console.log(`Đã cập nhật emoji ${emoji.code}`);
    }

    console.log('Hoàn thành cập nhật!');
    mongoose.disconnect();
}

migrateEmojiPath().catch(err => {
    console.error(err);
    mongoose.disconnect();
});
