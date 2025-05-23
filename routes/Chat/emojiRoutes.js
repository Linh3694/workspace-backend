const express = require('express');
const router = express.Router();
const CustomEmoji = require('../../models/CustomEmoji');
const authenticate = require('../../middleware/authMiddleware');

// Lấy danh sách emoji
router.get('/list', async (req, res) => {
    try {
        // Thêm log để debug
        console.log('Đang lấy danh sách emoji');
        const emojis = await CustomEmoji.find({}).sort({ category: 1, createdAt: 1 });
        console.log('Số lượng emoji tìm thấy:', emojis.length);

        // Đảm bảo response là JSON hợp lệ
        return res.status(200).json(emojis || []);
    } catch (error) {
        console.error("Error getting emojis:", error);
        return res.status(500).json({ message: error.message });
    }
});

// Thêm emoji mới (cần quyền admin)
router.post('/add', authenticate, async (req, res) => {
    try {
        const { name, code, category, type } = req.body;

        // Kiểm tra code đã tồn tại chưa
        const existing = await CustomEmoji.findOne({ code });
        if (existing) {
            return res.status(400).json({ message: 'Mã emoji đã tồn tại' });
        }

        const newEmoji = await CustomEmoji.create({
            name,
            code,
            category: category || 'custom',
            type: type || 'static',
            isDefault: false
        });

        res.status(201).json(newEmoji);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
