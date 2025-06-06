const express = require('express');
const router = express.Router();
const chatController = require('../../controllers/Chat/chatController');
const authenticate = require('../../middleware/authMiddleware');
const Message = require('../../models/Message');
const uploadChat = require('../../middleware/uploadChat');
const Chat = require('../../models/Chat');
const CustomEmoji = require('../../models/CustomEmoji');

// === CHAT 1-1 ROUTES ===
// Tạo hoặc lấy chat với người dùng khác
router.post('/create', authenticate, chatController.createOrGetChat);
router.post('/createOrGet', authenticate, chatController.createOrGetChat);

// === GROUP CHAT ROUTES ===
// Tạo group chat mới
router.post('/group/create', authenticate, chatController.createGroupChat);

// Thêm thành viên vào group
router.post('/group/:chatId/add-member', authenticate, chatController.addGroupMember);

// Xóa thành viên khỏi group
router.delete('/group/:chatId/remove-member/:userId', authenticate, chatController.removeGroupMember);

// Rời khỏi group
router.post('/group/:chatId/leave', authenticate, chatController.leaveGroup);

// Cập nhật thông tin group (tên, mô tả, avatar)
router.put('/group/:chatId/info', authenticate, uploadChat.single('avatar'), chatController.updateGroupInfo);

// Thêm/xóa admin
router.post('/group/:chatId/add-admin/:userId', authenticate, chatController.addGroupAdmin);
router.delete('/group/:chatId/remove-admin/:userId', authenticate, chatController.removeGroupAdmin);

// Cập nhật settings group
router.put('/group/:chatId/settings', authenticate, chatController.updateGroupSettings);

// Lấy danh sách thành viên group
router.get('/group/:chatId/members', authenticate, chatController.getGroupMembers);

// Tìm kiếm group chat
router.get('/group/search', authenticate, chatController.searchGroups);

// === EXISTING ROUTES ===
// Lấy danh sách chat của user
router.get('/list', authenticate, chatController.getUserChats);

// Lấy danh sách người dùng gần đây
router.get('/recent-users', authenticate, chatController.getRecentUsers);

// Gửi tin nhắn
router.post('/message', authenticate, chatController.sendMessage);

// Lấy tin nhắn của một chat
router.get('/messages/:chatId', authenticate, chatController.getChatMessages);

// Đánh dấu tất cả tin nhắn trong chat là đã đọc
router.post('/messages/:chatId/read', authenticate, chatController.markAllMessagesAsRead);

// Đánh dấu tin nhắn đã đọc
router.put('/message/:messageId/read', authenticate, chatController.markMessageAsRead);

// Upload file/ảnh cho chat
router.post('/upload-attachment', authenticate, uploadChat.single('file'), chatController.uploadChatAttachment);

// Upload nhiều ảnh cùng lúc
router.post('/upload-multiple', authenticate, uploadChat.array('files', 6), chatController.uploadMultipleImages);

// === THÊM MỚI: API XỬ LÝ REACTION VÀ REPLY ===

// API thêm reaction cho tin nhắn
router.post('/message/:messageId/react', authenticate, chatController.addReaction);

// API xóa reaction cho tin nhắn
router.delete('/message/:messageId/react', authenticate, chatController.removeReaction);

// API gửi tin nhắn trả lời một tin nhắn khác
router.post('/message/reply', authenticate, chatController.replyToMessage);

// API lấy tất cả reactions của một tin nhắn
router.get('/message/:messageId/reactions', authenticate, chatController.getMessageReactions);

// === THÊM MỚI: API XỬ LÝ GHIM TIN NHẮN ===

// API ghim tin nhắn
router.post('/message/:messageId/pin', authenticate, chatController.pinMessage);

// API bỏ ghim tin nhắn
router.delete('/message/:messageId/pin', authenticate, chatController.unpinMessage);

// API lấy danh sách tin nhắn ghim của một chat
router.get('/:chatId/pinned-messages', authenticate, chatController.getPinnedMessages);

// === THÊM MỚI: API XỬ LÝ CHUYỂN TIẾP TIN NHẮN ===

// API chuyển tiếp tin nhắn
router.post('/message/forward', authenticate, chatController.forwardMessage);

// API thu hồi tin nhắn
router.delete('/message/:messageId/revoke', authenticate, chatController.revokeMessage);

// === CLEANUP ROUTES ===

// API xóa chat rỗng (không có tin nhắn)
router.delete('/cleanup/empty', authenticate, chatController.cleanupEmptyChats);

// Lấy thông tin chi tiết của một chat
router.get('/:chatId', authenticate, async (req, res) => {
    try {
        const { chatId } = req.params;

        // Tìm chat và populate thông tin người tham gia
        const chat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email')
            .populate('lastMessage');

        if (!chat) {
            return res.status(404).json({ message: 'Không tìm thấy chat' });
        }

        // Kiểm tra xem người dùng hiện tại có phải là người tham gia vào chat không
        const isParticipant = chat.participants.some(
            participant => participant._id.toString() === req.user._id.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
        }

        res.status(200).json(chat);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 