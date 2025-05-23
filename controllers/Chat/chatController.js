const Chat = require('../../models/Chat');
const Message = require('../../models/Message');
const User = require('../../models/Users');
const notificationController = require('../Notification/notificationController');
const redisService = require('../../services/redisService');

// Tạo chat mới hoặc lấy chat hiện có
exports.createOrGetChat = async (req, res) => {
    try {
        const { participantId } = req.body;
        const currentUserId = req.user._id;

        // Kiểm tra cache trước
        const cacheKey = `chat:${currentUserId}_${participantId}`;
        let chat = await redisService.getChatData(cacheKey);

        if (!chat) {
            // Nếu không có trong cache, truy vấn database
            chat = await Chat.findOne({
                participants: {
                    $all: [currentUserId, participantId],
                    $size: 2
                }
            }).populate('participants', 'fullname avatarUrl email department');

            if (!chat) {
                // Tạo chat mới nếu chưa có
                chat = await Chat.create({
                    participants: [currentUserId, participantId]
                });
                chat = await chat.populate('participants', 'fullname avatarUrl email department');
            }

            // Lưu vào cache
            await redisService.setChatData(cacheKey, chat);
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

        // Kiểm tra cache trước
        let chats = await redisService.getUserChats(userId);

        if (!chats) {
            // Nếu không có trong cache, truy vấn database
            chats = await Chat.find({
                participants: userId,
                lastMessage: { $exists: true, $ne: null }
            })
                .populate('participants', 'fullname avatarUrl email department')
                .populate('lastMessage')
                .sort({ updatedAt: -1 });

            // Lưu vào cache
            await redisService.setUserChats(userId, chats);
        }

        res.status(200).json(chats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Gửi tin nhắn
const CustomEmoji = require('../../models/CustomEmoji');
const mongoose = require('mongoose');
exports.sendMessage = async (req, res) => {
    try {
        const {
            chatId,
            content,
            type = 'text',
            isEmoji = false,
            emojiId,
            emojiType,
            emojiName
        } = req.body;
        const senderId = req.user._id;

        // Validate required fields for emoji messages
        if (isEmoji && (!emojiId || !emojiType || !emojiName)) {
            return res.status(400).json({ 
                message: 'Missing required emoji fields',
                required: { emojiId, emojiType, emojiName }
            });
        }
        // If emoji, fetch its URL and resolve actual ID (lookup by _id or code)
        let emojiUrl;
        let actualEmojiId;
        if (isEmoji) {
            console.log('emojiId nhận được:', emojiId);
            let emojiRecord;
            if (mongoose.Types.ObjectId.isValid(emojiId)) {
                emojiRecord = await CustomEmoji.findById(emojiId);
            } else {
                emojiRecord = await CustomEmoji.findOne({ code: emojiId });
            }
            if (!emojiRecord) {
                console.error('Emoji not found. emojiId:', emojiId);
                return res.status(404).json({ message: 'Emoji not found' });
            }
            emojiUrl = emojiRecord.url;
            actualEmojiId = emojiRecord._id;
        }

        // Tạo tin nhắn mới
        const messageData = {
            chat: chatId,
            sender: senderId,
            content,
            type,
            readBy: [senderId]
        };

        if (isEmoji) {
            messageData.isEmoji   = true;
            messageData.emojiId   = actualEmojiId;
            messageData.emojiType = emojiType;
            messageData.emojiName = emojiName;
            messageData.emojiUrl  = emojiUrl;
        }

        const message = await Message.create(messageData);

        // Lấy thông tin chat để gửi thông báo
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

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
        console.error('Error sending message:', error);
        res.status(500).json({ message: error.message });
    }
};

// Lấy tin nhắn của một chat
exports.getChatMessages = async (req, res) => {
    try {
        const { chatId } = req.params;

        // Kiểm tra cache trước
        let messages = await redisService.getChatMessages(chatId);

        if (!messages) {
            // Nếu không có trong cache, truy vấn database
            messages = await Message.find({ chat: chatId })
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

            // Lưu vào cache
            await redisService.setChatMessages(chatId, messages);
        }

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

            // Xóa cache tin nhắn của chat
            await redisService.deleteChatMessagesCache(message.chat);

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

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chatId);
        updatedChat.participants.forEach(async (p) => {
            await redisService.deleteUserChatsCache(p._id.toString());
        });

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

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chatId);
        updatedChat.participants.forEach(async (p) => {
            await redisService.deleteUserChatsCache(p._id.toString());
        });

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

        // Xóa cache tin nhắn của chat
        await redisService.deleteChatMessagesCache(message.chat);

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

        // Xóa cache tin nhắn của chat
        await redisService.deleteChatMessagesCache(message.chat);

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

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chatId);
        const chat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email');
        chat.participants.forEach(async (p) => {
            await redisService.deleteUserChatsCache(p._id.toString());
        });

        // Emit socket event
        const io = req.app.get('io');
        io.to(chatId).emit('receiveMessage', populatedMessage);

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

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chat._id);
        chat.participants.forEach(async (p) => {
            await redisService.deleteUserChatsCache(p.toString());
        });

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

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chat._id);
        chat.participants.forEach(async (p) => {
            await redisService.deleteUserChatsCache(p.toString());
        });

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

// Lấy danh sách người dùng đã chat gần đây
exports.getRecentUsers = async (req, res) => {
    try {
        const currentUserId = req.user._id;

        // Lấy các chat gần đây của user
        const recentChats = await Chat.find({
            participants: currentUserId,
            lastMessage: { $exists: true }
        })
            .sort({ updatedAt: -1 })
            .limit(10)
            .populate('participants', 'fullname avatarUrl email department');

        // Lọc ra danh sách người dùng (không bao gồm user hiện tại)
        const recentUsers = recentChats.reduce((users, chat) => {
            const otherParticipants = chat.participants.filter(
                p => p._id.toString() !== currentUserId.toString()
            );
            return [...users, ...otherParticipants];
        }, []);

        // Loại bỏ các user trùng lặp
        const uniqueUsers = Array.from(new Map(
            recentUsers.map(user => [user._id.toString(), user])
        ).values());

        res.status(200).json({ users: uniqueUsers });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách người dùng gần đây:', error);
        res.status(500).json({ message: error.message });
    }
};

// Chuyển tiếp tin nhắn
exports.forwardMessage = async (req, res) => {
    try {
        const { messageId, toUserId } = req.body;
        const fromUserId = req.user._id;

        // Kiểm tra tin nhắn gốc
        const originalMessage = await Message.findById(messageId)
            .populate('sender', 'fullname avatarUrl email');
        if (!originalMessage) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn gốc' });
        }

        // Tìm hoặc tạo chat với người nhận
        let chat = await Chat.findOne({
            participants: {
                $all: [fromUserId, toUserId],
                $size: 2
            }
        });

        if (!chat) {
            chat = await Chat.create({
                participants: [fromUserId, toUserId]
            });
        }

        // Tạo tin nhắn chuyển tiếp
        const forwardedMessage = new Message({
            chat: chat._id,
            sender: fromUserId,
            content: originalMessage.content,
            type: originalMessage.type,
            isForwarded: true,
            originalMessage: messageId,
            originalSender: originalMessage.sender._id,
            readBy: [fromUserId],
            fileUrl: originalMessage.fileUrl,
            fileUrls: originalMessage.fileUrls,
            isEmoji: originalMessage.isEmoji,
            emojiId: originalMessage.emojiId,
            emojiType: originalMessage.emojiType,
            emojiName: originalMessage.emojiName,
            emojiUrl: originalMessage.emojiUrl
        });

        await forwardedMessage.save();

        // Cập nhật lastMessage trong chat
        await Chat.findByIdAndUpdate(chat._id, {
            lastMessage: forwardedMessage._id,
            updatedAt: Date.now()
        });

        // Populate các trường cần thiết
        const populatedMessage = await Message.findById(forwardedMessage._id)
            .populate('sender', 'fullname avatarUrl email')
            .populate('originalSender', 'fullname avatarUrl email');

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chat._id);
        chat.participants.forEach(async (p) => {
            await redisService.deleteUserChatsCache(p.toString());
        });

        // Emit socket event
        const io = req.app.get('io');
        io.to(chat._id.toString()).emit('receiveMessage', populatedMessage);

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chat._id)
            .populate('participants', 'fullname avatarUrl email')
            .populate('lastMessage');

        updatedChat.participants.forEach(p =>
            io.to(p._id.toString()).emit('newChat', updatedChat)
        );

        // Gửi thông báo push cho người nhận
        notificationController.sendNewChatMessageNotification(
            forwardedMessage,
            req.user.fullname,
            chat
        );

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('Lỗi khi chuyển tiếp tin nhắn:', error);
        res.status(500).json({ message: error.message });
    }
};

// Đánh dấu tất cả tin nhắn trong chat là đã đọc (chỉ cho các tin nhắn mình là người nhận)
exports.markAllMessagesAsRead = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Chỉ update các message mà user là người nhận (không phải người gửi)
        const result = await Message.updateMany(
            {
                chat: chatId,
                sender: { $ne: userId },
                readBy: { $ne: userId }
            },
            { $push: { readBy: userId } }
        );

        // Xóa cache tin nhắn của chat
        await redisService.deleteChatMessagesCache(chatId);

        // Emit socket event cho các client khác
        const io = req.app.get('io');
        io.to(chatId).emit('messageRead', {
            userId,
            chatId,
            timestamp: new Date().toISOString()
        });

        res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.revokeMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });

        // Chỉ cho phép người gửi thu hồi
        if (message.sender.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Bạn không có quyền thu hồi tin nhắn này' });
        }

        message.isRevoked = true;
        message.content = '[revoked]';
        // Xóa các trường liên quan đến file/hình ảnh
        message.fileUrl = undefined;
        message.fileUrls = undefined;
        message.fileName = undefined;
        message.fileSize = undefined;
        message.emojiUrl = undefined;
        message.emojiType = undefined;
        message.emojiId = undefined;
        message.isEmoji = false;
        
        await message.save();

        // Xóa cache nếu có
        await redisService.deleteChatMessagesCache(message.chat);

        // Emit socket event
        const io = req.app.get('io');
        io.to(message.chat.toString()).emit('messageRevoked', {
            messageId: message._id
        });

        res.status(200).json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};