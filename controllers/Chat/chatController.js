const Chat = require('../../models/Chat');
const Message = require('../../models/Message');
const User = require('../../models/Users');
const notificationController = require('../Notification/notificationController');

// Tạo chat mới hoặc lấy chat hiện có
exports.createOrGetChat = async (req, res) => {
    try {
        const { participantId } = req.body;
        const currentUserId = req.user._id;

        // Kiểm tra xem đã có chat giữa 2 người chưa
        let chat = await Chat.findOne({
            participants: {
                $all: [currentUserId, participantId],
                $size: 2
            }
        }).populate('participants', 'fullname avatarUrl email');

        if (!chat) {
            // Tạo chat mới nếu chưa có
            chat = await Chat.create({
                participants: [currentUserId, participantId]
            });
            chat = await chat.populate('participants', 'fullname avatarUrl email');
        }

        res.status(200).json(chat);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Lấy danh sách chat của user
exports.getUserChats = async (req, res) => {
    try {
        const userId = req.user._id;

        // Chỉ lấy các cuộc trò chuyện có lastMessage (đã có tin nhắn)
        const chats = await Chat.find({
            participants: userId,
            lastMessage: { $exists: true, $ne: null }
        })
            .populate('participants', 'fullname avatarUrl email')
            .populate('lastMessage')
            .sort({ updatedAt: -1 });

        res.status(200).json(chats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Gửi tin nhắn
exports.sendMessage = async (req, res) => {
    try {
        const {
            chatId,
            content,
            type = 'text',
            isEmoji = false,
            emojiId = null,
            emojiType = null,
            emojiName = null,
            emojiUrl = null
        } = req.body;
        const senderId = req.user._id;

        // Tạo tin nhắn mới
        const message = await Message.create({
            chat: chatId,
            sender: senderId,
            content,
            type,
            readBy: [senderId],
            isEmoji,
            emojiId,
            emojiType,
            emojiName,
            emojiUrl
        });

        // Lấy thông tin chat để gửi thông báo
        const chat = await Chat.findById(chatId);

        // Cập nhật lastMessage trong chat
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            updatedAt: Date.now()
        });

        // Populate thông tin người gửi
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'fullname avatarUrl email');

        // Emit socket event
        const io = req.app.get('io');
        io.to(chatId).emit('receiveMessage', populatedMessage);

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate('lastMessage');

        updatedChat.participants.forEach(p =>
            io.to(p._id.toString()).emit('newChat', updatedChat)
        );

        // Gửi thông báo push cho người nhận
        if (chat) {
            notificationController.sendNewChatMessageNotification(
                message,
                req.user.fullname,
                chat
            );
        }

        res.status(201).json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Lấy tin nhắn của một chat
exports.getChatMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const messages = await Message.find({ chat: chatId })
            .populate('sender', 'fullname avatarUrl email')
            .populate('originalSender', 'fullname avatarUrl email')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            })
            .sort({ createdAt: 1 });

        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Đánh dấu tin nhắn đã đọc
exports.markMessageAsRead = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        if (!message.readBy.includes(userId)) {
            message.readBy.push(userId);
            await message.save();

            // Emit socket event thông báo tin nhắn đã được đọc
            const io = req.app.get('io');
            io.to(message.chat.toString()).emit('messageRead', {
                messageId: message._id,
                userId: userId,
                chatId: message.chat
            });
        }

        res.status(200).json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Upload file/ảnh cho chat
exports.uploadChatAttachment = async (req, res) => {
    try {
        const { chatId } = req.body;
        const senderId = req.user._id;
        if (!req.file) {
            return res.status(400).json({ message: 'Không có file được upload' });
        }
        // Xác định loại file
        let type = 'file';
        if (req.file.mimetype.startsWith('image/')) {
            type = 'image';
        }
        // Đường dẫn file trả về cho client
        const fileUrl = `/uploads/Chat/${req.file.filename}`;
        // Tạo message
        const message = await Message.create({
            chat: chatId,
            sender: senderId,
            content: req.file.originalname,
            type,
            fileUrl,
            readBy: [senderId]
        });

        // Lấy thông tin chat để gửi thông báo
        const chat = await Chat.findById(chatId);

        // Cập nhật lastMessage trong chat
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            updatedAt: Date.now()
        });
        // Populate sender
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'fullname avatarUrl email');
        // Emit socket event
        const io = req.app.get('io');
        io.to(chatId).emit('receiveMessage', populatedMessage);
        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate('lastMessage');
        updatedChat.participants.forEach(p =>
            io.to(p._id.toString()).emit('newChat', updatedChat)
        );

        // Gửi thông báo push cho người nhận
        if (chat) {
            notificationController.sendNewChatMessageNotification(
                message,
                req.user.fullname,
                chat
            );
        }

        res.status(201).json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Upload nhiều ảnh cùng lúc
exports.uploadMultipleImages = async (req, res) => {
    try {
        const { chatId } = req.body;
        const senderId = req.user._id;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Không có file được upload' });
        }

        // Lưu đường dẫn của tất cả các file
        const fileUrls = req.files.map(file => `/uploads/Chat/${file.filename}`);

        // Tạo message với danh sách fileUrls
        const message = await Message.create({
            chat: chatId,
            sender: senderId,
            content: `${req.files.length} ảnh`,
            type: 'multiple-images',
            fileUrl: fileUrls[0], // Lưu ảnh đầu tiên làm ảnh đại diện cho các thumbnail
            fileUrls: fileUrls,   // Mảng chứa tất cả đường dẫn ảnh
            readBy: [senderId]
        });

        // Lấy thông tin chat để gửi thông báo
        const chat = await Chat.findById(chatId);

        // Cập nhật lastMessage trong chat
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            updatedAt: Date.now()
        });

        // Populate sender
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'fullname avatarUrl email');

        // Emit socket event
        const io = req.app.get('io');
        io.to(chatId).emit('receiveMessage', populatedMessage);

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate('lastMessage');

        updatedChat.participants.forEach(p =>
            io.to(p._id.toString()).emit('newChat', updatedChat)
        );

        // Gửi thông báo push cho người nhận
        if (chat) {
            notificationController.sendNewChatMessageNotification(
                message,
                req.user.fullname,
                chat
            );
        }

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('Error uploading multiple images:', error);
        res.status(500).json({ message: error.message });
    }
};

// === THÊM MỚI: XỬ LÝ REACTION VÀ REPLY ===

// Thêm reaction vào tin nhắn
exports.addReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emojiCode, isCustom } = req.body;
        const userId = req.user._id;

        if (!emojiCode) {
            return res.status(400).json({ message: 'Thiếu thông tin emoji' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        // Kiểm tra xem người dùng đã reaction chưa
        const existingReactionIndex = message.reactions.findIndex(
            reaction => reaction.user.toString() === userId.toString()
        );

        if (existingReactionIndex !== -1) {
            // Nếu đã reaction, cập nhật emoji mới
            message.reactions[existingReactionIndex].emojiCode = emojiCode;
            message.reactions[existingReactionIndex].isCustom = isCustom || false;
        } else {
            // Nếu chưa reaction, thêm reaction mới
            message.reactions.push({
                user: userId,
                emojiCode,
                isCustom: isCustom || false
            });
        }

        await message.save();

        const populatedMessage = await Message.findById(messageId)
            .populate('sender', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email');

        // Emit socket event
        const io = req.app.get('io');
        io.to(message.chat.toString()).emit('messageReaction', {
            messageId: message._id,
            reactions: populatedMessage.reactions
        });

        res.status(200).json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Xóa reaction khỏi tin nhắn
exports.removeReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        // Lọc ra những reaction không phải của người dùng hiện tại
        message.reactions = message.reactions.filter(
            reaction => reaction.user.toString() !== userId.toString()
        );

        await message.save();

        // Emit socket event
        const io = req.app.get('io');
        io.to(message.chat.toString()).emit('messageReaction', {
            messageId: message._id,
            reactions: message.reactions
        });

        res.status(200).json({ message: 'Đã xóa reaction' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Trả lời tin nhắn
exports.replyToMessage = async (req, res) => {
    try {
        const { chatId, content, replyToId, type = 'text' } = req.body;
        const senderId = req.user._id;

        // Kiểm tra tin nhắn được reply có tồn tại không
        const originalMessage = await Message.findById(replyToId);
        if (!originalMessage) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn cần trả lời' });
        }

        // Tạo tin nhắn reply mới
        const message = await Message.create({
            chat: chatId,
            sender: senderId,
            content,
            type,
            replyTo: replyToId,
            readBy: [senderId]
        });

        // Cập nhật lastMessage trong chat
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            updatedAt: Date.now()
        });

        // Populate thông tin người gửi và tin nhắn reply
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'fullname avatarUrl email')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            });

        // Emit socket event
        const io = req.app.get('io');
        io.to(chatId).emit('receiveMessage', populatedMessage);

        // Lấy thông tin chat để gửi thông báo
        const chat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email');

        // Gửi thông báo push cho người nhận
        notificationController.sendNewChatMessageNotification(
            message,
            req.user.fullname,
            chat
        );

        res.status(201).json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Lấy tất cả reactions của một tin nhắn
exports.getMessageReactions = async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findById(messageId)
            .populate('reactions.user', 'fullname avatarUrl email');

        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        res.status(200).json(message.reactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// === THÊM MỚI: XỬ LÝ GHIM TIN NHẮN ===

// Ghim tin nhắn
exports.pinMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        // Tìm tin nhắn
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        // Tìm chat
        const chat = await Chat.findById(message.chat);
        if (!chat) {
            return res.status(404).json({ message: 'Không tìm thấy chat' });
        }

        // Kiểm tra xem người dùng có trong chat không
        const isParticipant = chat.participants.some(
            participant => participant.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'Bạn không có quyền ghim tin nhắn trong chat này' });
        }

        // Kiểm tra số lượng tin nhắn đã ghim (giới hạn 3 tin nhắn ghim mỗi chat)
        if (chat.pinnedMessages && chat.pinnedMessages.length >= 3) {
            return res.status(400).json({
                message: 'Đã đạt giới hạn tin ghim (tối đa 3 tin nhắn)',
                pinnedCount: chat.pinnedMessages.length
            });
        }

        // Cập nhật tin nhắn thành đã ghim
        message.isPinned = true;
        message.pinnedBy = userId;
        message.pinnedAt = new Date();
        await message.save();

        // Thêm vào danh sách tin nhắn ghim của chat nếu chưa có
        if (!chat.pinnedMessages.includes(messageId)) {
            chat.pinnedMessages.push(messageId);
            await chat.save();
        }

        // Populate tin nhắn đã ghim
        const populatedMessage = await Message.findById(messageId)
            .populate('sender', 'fullname avatarUrl email')
            .populate('pinnedBy', 'fullname avatarUrl email');

        // Emit socket event
        const io = req.app.get('io');
        io.to(chat._id.toString()).emit('messagePinned', populatedMessage);

        res.status(200).json(populatedMessage);
    } catch (error) {
        console.error('Error pinning message:', error);
        res.status(500).json({ message: error.message });
    }
};

// Bỏ ghim tin nhắn
exports.unpinMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        // Tìm tin nhắn
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        // Tìm chat
        const chat = await Chat.findById(message.chat);
        if (!chat) {
            return res.status(404).json({ message: 'Không tìm thấy chat' });
        }

        // Kiểm tra xem người dùng có trong chat không
        const isParticipant = chat.participants.some(
            participant => participant.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'Bạn không có quyền thao tác ghim tin nhắn trong chat này' });
        }

        // Cập nhật tin nhắn thành không ghim
        message.isPinned = false;
        message.pinnedBy = undefined;
        message.pinnedAt = undefined;
        await message.save();

        // Xóa khỏi danh sách tin nhắn ghim của chat
        chat.pinnedMessages = chat.pinnedMessages.filter(
            id => id.toString() !== messageId.toString()
        );
        await chat.save();

        // Emit socket event
        const io = req.app.get('io');
        io.to(chat._id.toString()).emit('messageUnpinned', { messageId });

        res.status(200).json({ message: 'Đã bỏ ghim tin nhắn' });
    } catch (error) {
        console.error('Error unpinning message:', error);
        res.status(500).json({ message: error.message });
    }
};

// Lấy danh sách tin nhắn ghim của chat
exports.getPinnedMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Tìm chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Không tìm thấy chat' });
        }

        // Kiểm tra xem người dùng có trong chat không
        const isParticipant = chat.participants.some(
            participant => participant.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'Bạn không có quyền xem tin nhắn ghim trong chat này' });
        }

        // Lấy danh sách tin nhắn ghim
        const pinnedMessages = await Message.find({
            _id: { $in: chat.pinnedMessages }
        })
            .populate('sender', 'fullname avatarUrl email')
            .populate('pinnedBy', 'fullname avatarUrl email')
            .sort({ pinnedAt: -1 });

        res.status(200).json(pinnedMessages);
    } catch (error) {
        console.error('Error getting pinned messages:', error);
        res.status(500).json({ message: error.message });
    }
};

// === THÊM MỚI: XỬ LÝ CHUYỂN TIẾP TIN NHẮN ===

// Chuyển tiếp tin nhắn
exports.forwardMessage = async (req, res) => {
    try {
        const { messageId, targetChatId } = req.body;
        const senderId = req.user._id;

        // Tìm tin nhắn gốc
        const originalMessage = await Message.findById(messageId).populate('sender', 'fullname avatarUrl email');
        if (!originalMessage) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn gốc' });
        }

        // Tìm chat đích
        const targetChat = await Chat.findById(targetChatId);
        if (!targetChat) {
            return res.status(404).json({ message: 'Không tìm thấy chat đích' });
        }

        // Kiểm tra xem người dùng có quyền truy cập chat đích không
        const isParticipant = targetChat.participants.some(
            participant => participant.toString() === senderId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập chat đích' });
        }

        // Tạo tin nhắn chuyển tiếp
        const forwardedMessage = new Message({
            chat: targetChatId,
            sender: senderId,
            content: originalMessage.content,
            type: originalMessage.type,
            isForwarded: true,
            originalMessage: messageId,
            originalSender: originalMessage.sender._id,
            readBy: [senderId],
            // Sao chép các trường khác cần thiết
            fileUrl: originalMessage.fileUrl,
            fileUrls: originalMessage.fileUrls,
            isEmoji: originalMessage.isEmoji,
            emojiId: originalMessage.emojiId,
            emojiType: originalMessage.emojiType,
            emojiName: originalMessage.emojiName,
            emojiUrl: originalMessage.emojiUrl
        });

        await forwardedMessage.save();

        // Cập nhật lastMessage trong chat đích
        await Chat.findByIdAndUpdate(targetChatId, {
            lastMessage: forwardedMessage._id,
            updatedAt: Date.now()
        });

        // Populate các trường cần thiết cho tin nhắn chuyển tiếp
        const populatedMessage = await Message.findById(forwardedMessage._id)
            .populate('sender', 'fullname avatarUrl email')
            .populate('originalSender', 'fullname avatarUrl email');

        // Emit socket event
        const io = req.app.get('io');
        io.to(targetChatId).emit('receiveMessage', populatedMessage);

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(targetChatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate('lastMessage');

        updatedChat.participants.forEach(p =>
            io.to(p._id.toString()).emit('newChat', updatedChat)
        );

        // Gửi thông báo push cho người nhận
        notificationController.sendNewChatMessageNotification(
            forwardedMessage,
            req.user.fullname,
            targetChat
        );

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('Error forwarding message:', error);
        res.status(500).json({ message: error.message });
    }
}; 