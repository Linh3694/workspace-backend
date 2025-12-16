const Chat = require('../../models/Chat');
const Message = require('../../models/Message');
const User = require('../../models/Users');
const notificationController = require('../Notification/notificationController');
const redisService = require('../../services/redisService');
const CustomEmoji = require('../../models/CustomEmoji');
const mongoose = require('mongoose');

// Tạo chat mới hoặc lấy chat hiện có
exports.createOrGetChat = async (req, res) => {
    try {
        const { participantId } = req.body;
        const currentUserId = req.user._id;

        // Kiểm tra cache trước
        const cacheKey = `chat:${currentUserId}_${participantId}`;
        let chat = await redisService.getChatData(cacheKey);

        if (!chat) {
            // Nếu không có trong cache, truy vấn database - chỉ tìm chat 1-1 (không phải group)
            chat = await Chat.findOne({
                participants: {
                    $all: [currentUserId, participantId],
                    $size: 2
                },
                $or: [
                    { isGroup: false },
                    { isGroup: { $exists: false } }
                ]
            }).populate('participants', 'fullname avatarUrl email department');

            if (!chat) {
                // Tạo chat mới nếu chưa có - đảm bảo set isGroup: false cho chat 1-1
                chat = await Chat.create({
                    participants: [currentUserId, participantId],
                    isGroup: false
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
        const userId = req.user?._id;

        // Validate user ID
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated or user ID missing' });
        }

        // Log userId details for debugging
        console.log('getUserChats - userId type:', typeof userId, 'userId value:', userId);

        // Kiểm tra cache trước - sử dụng key mới để tránh conflict với cache cũ
        let chats = await redisService.getUserChats(`${userId}_v2`);

        if (!chats) {
            // Nếu không có trong cache, truy vấn database
            chats = await Chat.find({
                participants: userId
            })
                .select('name description avatar isGroup creator admins participants lastMessage settings createdAt updatedAt')
                .populate('participants', 'fullname avatarUrl email department')
                .populate('creator', 'fullname avatarUrl email')
                .populate('admins', 'fullname avatarUrl email')
                .populate({
                    path: 'lastMessage',
                    populate: {
                        path: 'sender',
                        select: 'fullname avatarUrl email'
                    }
                })
                .sort({ updatedAt: -1 });

            // Lọc chat theo điều kiện:
            // 1. Chat 1-1: Chỉ hiển thị khi có tin nhắn
            // 2. Group chat: Hiển thị khi có tin nhắn HOẶC được tạo trong vòng 24h gần đây
            if (chats && Array.isArray(chats)) {
                const now = new Date();
                const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 giờ trước
                
                const filteredChats = chats.filter(chat => {
                    // Chat 1-1: Chỉ giữ những chat có tin nhắn
                    if (!chat.isGroup) {
                        return chat.lastMessage;
                    }
                    
                    // Group chat: Giữ những chat có tin nhắn HOẶC được tạo gần đây
                    if (chat.isGroup) {
                        const hasMessages = chat.lastMessage;
                        const isRecentlyCreated = new Date(chat.createdAt) > oneDayAgo;
                        
                        // Luôn hiển thị group chat nếu:
                        // - Có tin nhắn, HOẶC
                        // - Được tạo trong vòng 24h (group mới có thể chưa có tin nhắn)
                        return hasMessages || isRecentlyCreated;
                    }
                    
                    return true; // Fallback
                });
                
                console.log('getUserChats - Filtered chats:', {
                    originalCount: chats.length,
                    filteredCount: filteredChats.length,
                    removedChats: chats.length - filteredChats.length,
                    userId: userId.toString()
                });
                
                chats = filteredChats;
            }

            // Log chats details for debugging
            console.log('getUserChats - Found chats count:', chats?.length, 'chats type:', typeof chats);

            // Lưu vào cache - only if chats is valid
            if (chats && Array.isArray(chats)) {
                try {
                    await redisService.setUserChats(`${userId}_v2`, chats);
                } catch (redisError) {
                    console.error('Error caching user chats:', redisError);
                    // Don't throw the error, just log it and continue
                }
            }
        }

        res.status(200).json(chats || []);
    } catch (error) {
        console.error('Error in getUserChats:', error);
        res.status(500).json({ message: error.message });
    }
};

// Gửi tin nhắn với message queuing và delivery tracking
const messageQueue = new Map();
const deliveryStatus = new Map();

// Helper function để track delivery status
const trackMessageDelivery = (messageId, participants) => {
    deliveryStatus.set(messageId, {
        sent: Date.now(),
        delivered: new Set(),
        read: new Set(),
        participants: participants.map(p => p.toString())
    });
};

// Helper function để update delivery status
const updateDeliveryStatus = (messageId, userId, status) => {
    const delivery = deliveryStatus.get(messageId);
    if (delivery) {
        if (status === 'delivered') {
            delivery.delivered.add(userId);
        } else if (status === 'read') {
            delivery.read.add(userId);
        }
    }
};

// Helper function to safely get participant ID as string
const getParticipantId = (participant) => {
    return participant && participant._id ? participant._id.toString() : null;
};

// Helper function để invalidate cache của user với version mới
const invalidateUserChatCache = async (userId) => {
    if (!userId) return;
    try {
        // Xóa cả cache cũ và cache mới
        await redisService.deleteUserChatsCache(userId);
        await redisService.deleteUserChatsCache(`${userId}_v2`);
    } catch (error) {
        console.error('Error invalidating user chat cache:', error);
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const {
            chatId,
            content,
            type = 'text',
            replyTo = null,
            isEmoji = false,
            emojiId = null,
            emojiType = null,
            emojiName = null,
            emojiUrl = null,
            tempId = null // Client-side temporary ID để tránh duplicate
        } = req.body;
        const senderId = req.user._id;

        // Kiểm tra duplicate message bằng tempId
        if (tempId && messageQueue.has(tempId)) {
            return res.status(200).json(messageQueue.get(tempId));
        }

        // Validate input - cho phép content rỗng nếu là emoji
        if ((!content || !content.trim()) && !isEmoji) {
            return res.status(400).json({ message: 'Nội dung tin nhắn không được để trống' });
        }

        // Kiểm tra chat tồn tại và user có quyền
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.includes(senderId)) {
            return res.status(403).json({ message: 'Không có quyền gửi tin nhắn trong chat này' });
        }

        // Tạo tin nhắn mới
        const message = await Message.create({
            chat: chatId,
            sender: senderId,
            content: content ? content.trim() : '',
            type,
            readBy: [senderId],
            isEmoji,
            emojiId,
            emojiType,
            emojiName,
            emojiUrl,
            isGroup: chat.isGroup || false, // Đánh dấu đây là group message hay không
            replyTo: replyTo ? replyTo.toString() : null
        });

        // Cập nhật lastMessage trong chat
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            updatedAt: Date.now()
        });

        // Cache message nếu có tempId
        if (tempId) {
            messageQueue.set(tempId, message);
            // Cleanup sau 5 phút
            setTimeout(() => messageQueue.delete(tempId), 5 * 60 * 1000);
        }

        // Populate thông tin người gửi
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'fullname avatarUrl email')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            });

        // Track delivery status
        trackMessageDelivery(message._id, chat.participants);

        // Emit socket event với retry mechanism
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        console.log('📤 [Backend] About to emit receiveMessage to room:', chatId);
        console.log('📤 [Backend] Message data:', {
            id: populatedMessage._id,
            content: populatedMessage.content,
            sender: populatedMessage.sender._id,
            chat: populatedMessage.chat,
            isGroup: populatedMessage.isGroup
        });
        
        const emitWithRetry = async (event, data, retries = 3) => {
            try {
                console.log(`📤 [Backend] Emitting ${event} to room ${chatId}`);
                console.log(`📤 [Backend] Chat type:`, { isGroup: chat.isGroup, chatId });
                
                // Sử dụng namespace phù hợp dựa trên chat type
                if (chat.isGroup) {
                    // Fix cho Redis adapter - sử dụng fetchSockets thay vì adapter.rooms.get
                    try {
                        const sockets = await groupChatNamespace.in(chatId).fetchSockets();
                        const roomSize = sockets.length;
                        const roomMembers = sockets.map(s => s.id);
                        console.log(`📤 [Backend] GROUP: Room ${chatId} has ${roomSize} connected members:`, roomMembers);
                        
                        groupChatNamespace.to(chatId).emit(event, data);
                        console.log(`✅ [Backend] Successfully emitted ${event} to GROUP room ${chatId}`);
                        
                        // Double check logging
                        console.log(`🔍 [Backend] Room ${chatId} has ${sockets.length} sockets:`, sockets.map(s => s.id));
                    } catch (fetchError) {
                        console.warn(`⚠️ [Backend] Could not fetch group room size for ${chatId}, emitting anyway:`, fetchError.message);
                        groupChatNamespace.to(chatId).emit(event, data);
                        console.log(`✅ [Backend] Successfully emitted ${event} to GROUP room ${chatId} (no size check)`);
                    }
                } else {
                    // Fix cho Redis adapter - sử dụng fetchSockets thay vì adapter.rooms.get
                    try {
                        const sockets = await io.in(chatId).fetchSockets();
                        const roomSize = sockets.length;
                        console.log(`📤 [Backend] 1-1: Room ${chatId} has ${roomSize} connected members`);
                        io.to(chatId).emit(event, data);
                        console.log(`✅ [Backend] Successfully emitted ${event} to 1-1 room ${chatId}`);
                    } catch (fetchError) {
                        console.warn(`⚠️ [Backend] Could not fetch room size for ${chatId}, emitting anyway:`, fetchError.message);
                        io.to(chatId).emit(event, data);
                        console.log(`✅ [Backend] Successfully emitted ${event} to 1-1 room ${chatId} (no size check)`);
                    }
                }
            } catch (error) {
                console.error(`❌ [Backend] Error emitting ${event} to room ${chatId}:`, error);
                if (retries > 0) {
                    console.log(`🔄 [Backend] Retrying emit ${event} (${retries} retries left)`);
                    setTimeout(async () => await emitWithRetry(event, data, retries - 1), 1000);
                } else {
                    console.error(`❌ [Backend] Failed to emit ${event} after all retries`);
                    // Use  if available, otherwise console.error
                }
            }
        };

        await emitWithRetry('receiveMessage', populatedMessage);

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            });

        // Emit chat update với delivery confirmation
        updatedChat.participants.forEach(p => {
            const participantId = getParticipantId(p);
            if (participantId && participantId !== senderId.toString()) {
                io.to(participantId).emit('newChat', updatedChat);
                // Track delivery
                updateDeliveryStatus(message._id, participantId, 'delivered');
            }
        });

        // Invalidate caches hiệu quả
        await redisService.invalidateChatCaches(
            chatId, 
            chat.participants.filter(p => p).map(p => p.toString())
        );

        // Invalidate user chat caches với version mới
        for (const participantId of chat.participants) {
            await invalidateUserChatCache(participantId.toString());
        }

        // Gửi thông báo push cho người nhận (async)
        setImmediate(() => {
            notificationController.sendNewChatMessageNotification(
                message,
                req.user.fullname,
                chat
            );
        });

        res.status(201).json({
            ...populatedMessage.toObject(),
            deliveryStatus: 'sent',
            tempId
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: error.message });
    }
};

// Lấy tin nhắn của một chat với pagination
exports.getChatMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Validate chatId
        if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid chat ID' 
            });
        }

        // Validate pagination parameters
        if (page < 1 || limit < 1 || limit > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid pagination parameters' 
            });
        }

        // Kiểm tra user có quyền truy cập chat không
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chat not found' 
            });
        }

        if (!chat.participants.includes(req.user._id)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        // Kiểm tra cache trước với key bao gồm page
        const cacheKey = `chat:messages:${chatId}:page:${page}:limit:${limit}`;
        let cachedResult = await redisService.getChatMessages(cacheKey);

        if (cachedResult && cachedResult.success && cachedResult.data) {
            console.log(`[Cache Hit] Messages for chat ${chatId}, page ${page}`);
            return res.status(200).json({
                success: true,
                messages: cachedResult.data,
                pagination: {
                    page,
                    limit,
                    hasMore: cachedResult.data.length === limit
                }
            });
        }

        console.log(`[Cache Miss] Loading messages from DB for chat ${chatId}, page ${page}`);

        // Nếu không có trong cache, truy vấn database với pagination
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
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Đảo ngược thứ tự để hiển thị đúng (cũ nhất trước)
        const reversedMessages = messages.reverse();

        // Lưu vào cache với TTL ngắn hơn cho pagination
        if (reversedMessages.length > 0) {
            await redisService.setChatMessages(cacheKey, reversedMessages, 300);
        }

        // Kiểm tra xem có tin nhắn cũ hơn không để xác định hasMore
        let hasMore = false;
        if (messages.length === limit) {
            const nextPageMessages = await Message.find({ chat: chatId })
                .sort({ createdAt: -1 })
                .skip(skip + limit)
                .limit(1)
                .lean();
            hasMore = nextPageMessages.length > 0;
        }

        res.status(200).json({
            success: true,
            messages: reversedMessages,
            pagination: {
                page,
                limit,
                hasMore
            }
        });
    } catch (error) {
        console.error('Error in getChatMessages:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

        // Lấy thông tin chat để kiểm tra isGroup
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
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
            readBy: [senderId],
            isGroup: chat.isGroup || false // Đánh dấu đây là group message hay không
        });

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
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        // Sử dụng namespace phù hợp dựa trên chat type
        if (chat.isGroup) {
            groupChatNamespace.to(chatId).emit('receiveMessage', populatedMessage);
        } else {
            io.to(chatId).emit('receiveMessage', populatedMessage);
        }

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            });

        updatedChat.participants.forEach(p => {
            const participantId = getParticipantId(p);
            if (participantId) {
                io.to(participantId).emit('newChat', updatedChat);
            }
        });

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chatId);
        const chatForCache = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email');
        chatForCache.participants.forEach(async (p) => {
            const participantId = getParticipantId(p);
            if (participantId) {
                await invalidateUserChatCache(participantId);
            }
        });

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

// Upload nhiều ảnh cùng lúc
exports.uploadMultipleImages = async (req, res) => {
    try {
        const { chatId } = req.body;
        const senderId = req.user._id;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Không có file được upload' });
        }

        // Lấy thông tin chat để kiểm tra isGroup
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
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
            readBy: [senderId],
            isGroup: chat.isGroup || false // Đánh dấu đây là group message hay không
        });

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
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        // Sử dụng namespace phù hợp dựa trên chat type
        if (chat.isGroup) {
            groupChatNamespace.to(chatId).emit('receiveMessage', populatedMessage);
        } else {
            io.to(chatId).emit('receiveMessage', populatedMessage);
        }

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            });

        updatedChat.participants.forEach(p => {
            const participantId = getParticipantId(p);
            if (participantId) {
                io.to(participantId).emit('newChat', updatedChat);
            }
        });

        // Xóa cache liên quan
        await redisService.deleteChatMessagesCache(chatId);
        const chatForCache = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email');
        chatForCache.participants.forEach(async (p) => {
            const participantId = getParticipantId(p);
            if (participantId) {
                await invalidateUserChatCache(participantId);
            }
        });

        // Gửi thông báo push cho người nhận
        notificationController.sendNewChatMessageNotification(
            message,
            req.user.fullname,
            chat
        );

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

        // Lấy thông tin chat để kiểm tra type
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Không tìm thấy chat' });
        }

        // Tạo tin nhắn reply mới
        const message = await Message.create({
            chat: chatId,
            sender: senderId,
            content,
            type,
            replyTo: replyToId,
            readBy: [senderId],
            isGroup: chat.isGroup || false // Đánh dấu đây là group message hay không
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
        const chatForCache = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email');
        chatForCache.participants.forEach(async (p) => {
            const participantId = getParticipantId(p);
            if (participantId) {
                await invalidateUserChatCache(participantId);
            }
        });

        // Emit socket event
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        // Sử dụng namespace phù hợp dựa trên chat type
        if (chat.isGroup) {
            groupChatNamespace.to(chat._id.toString()).emit('receiveMessage', populatedMessage);
        } else {
            io.to(chat._id.toString()).emit('receiveMessage', populatedMessage);
        }

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
            const participantId = getParticipantId(p);
            if (participantId) {
                await invalidateUserChatCache(participantId);
            }
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
            const participantId = getParticipantId(p);
            if (participantId) {
                await invalidateUserChatCache(participantId);
            }
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
                p => p && p._id && p._id.toString() !== currentUserId.toString()
            );
            return [...users, ...otherParticipants];
        }, []);

        // Loại bỏ các user trùng lặp
        const uniqueUsers = Array.from(new Map(
            recentUsers.filter(user => user && user._id).map(user => [user._id.toString(), user])
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
            emojiUrl: originalMessage.emojiUrl,
            isGroup: chat.isGroup || false // Đánh dấu đây là group message hay không
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
            const participantId = getParticipantId(p);
            if (participantId) {
                await invalidateUserChatCache(participantId);
            }
        });

        // Emit socket event
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        // Sử dụng namespace phù hợp dựa trên chat type
        if (chat.isGroup) {
            groupChatNamespace.to(chat._id.toString()).emit('receiveMessage', populatedMessage);
        } else {
            io.to(chat._id.toString()).emit('receiveMessage', populatedMessage);
        }

        // Lấy lại chat đã cập nhật kèm populate
        const updatedChat = await Chat.findById(chat._id)
            .populate('participants', 'fullname avatarUrl email')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'fullname avatarUrl email'
                }
            });

        updatedChat.participants.forEach(p => {
            const participantId = getParticipantId(p);
            if (participantId) {
                io.to(participantId).emit('newChat', updatedChat);
            }
        });

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
        
        // Xóa cache danh sách chat của tất cả participants
        const chatForCache = await Chat.findById(chatId).populate('participants');
        if (chatForCache) {
            chatForCache.participants.forEach(async (p) => {
                const participantId = getParticipantId(p);
                if (participantId) {
                    await invalidateUserChatCache(participantId);
                }
            });
        }

        // Emit socket event cho các client khác
        const io = req.app.get('io');
        
        // Emit cho tất cả participants trong chat
        const chat = await Chat.findById(chatId).populate('participants');
        if (chat) {
            chat.participants.forEach(participant => {
                const participantId = getParticipantId(participant);
                if (participantId) {
                    io.to(participantId).emit('messageRead', {
                        userId,
                        chatId,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        }

        res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Thu hồi tin nhắn
exports.revokeMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        console.log('🔍 [REVOKE] Debug info:', {
            messageId,
            userId: userId.toString(),
            userType: typeof userId,
            userIdObject: userId
        });

        // Tìm tin nhắn
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
        }

        console.log('🔍 [REVOKE] Message info:', {
            messageSender: message.sender.toString(),
            senderType: typeof message.sender,
            senderObject: message.sender,
            isEqual: message.sender.toString() === userId.toString()
        });

        // Kiểm tra quyền thu hồi (chỉ người gửi mới có thể thu hồi)
        const messageSenderId = message.sender.toString();
        const currentUserId = userId.toString();
        
        if (messageSenderId !== currentUserId) {
            console.log('❌ [REVOKE] Permission denied:', {
                messageSender: messageSenderId,
                currentUser: currentUserId,
                comparison: `${messageSenderId} !== ${currentUserId}`
            });
            return res.status(403).json({ message: 'Bạn không có quyền thu hồi tin nhắn này' });
        }

        // Kiểm tra thời gian thu hồi (có thể thu hồi trong vòng 24 giờ)
        const messageAge = Date.now() - new Date(message.createdAt).getTime();
        const maxRevokeTime = 24 * 60 * 60 * 1000; // 24 giờ
        
        if (messageAge > maxRevokeTime) {
            return res.status(400).json({ message: 'Không thể thu hồi tin nhắn sau 24 giờ' });
        }

        console.log('✅ [REVOKE] Permission granted, proceeding with revoke');

        // Đánh dấu tin nhắn là đã thu hồi
        message.isRevoked = true;
        message.revokedAt = new Date();
        message.revokedBy = userId;
        
        // Xóa nội dung tin nhắn - set placeholder thay vì chuỗi rỗng
        message.content = '[Tin nhắn đã được thu hồi]';
        message.fileUrl = undefined;
        message.fileUrls = undefined;
        message.fileName = undefined;
        message.fileSize = undefined;
        message.emojiUrl = undefined;
        message.emojiType = undefined;
        message.emojiId = undefined;
        message.isEmoji = false;

        await message.save();

        // Xóa cache tin nhắn của chat
        await redisService.deleteChatMessagesCache(message.chat);

        // Emit socket event
        const io = req.app.get('io');
        io.to(message.chat.toString()).emit('messageRevoked', {
            messageId: message._id,
            chatId: message.chat
        });

        res.status(200).json({ message: 'Đã thu hồi tin nhắn thành công' });
    } catch (error) {
        console.error('Error revoking message:', error);
        res.status(500).json({ message: error.message });
    }
};

// ====================== GROUP CHAT CONTROLLERS ======================

// Tạo group chat mới
exports.createGroupChat = async (req, res) => {
    try {
        const { name, description, participantIds = [] } = req.body;
        const creatorId = req.user._id;

        // Validate input
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Tên nhóm không được để trống' });
        }

        if (name.length > 100) {
            return res.status(400).json({ message: 'Tên nhóm không được quá 100 ký tự' });
        }

        // Đảm bảo creator có trong danh sách participants
        const allParticipants = [creatorId, ...participantIds.filter(id => id !== creatorId.toString())];

        if (allParticipants.length < 2) {
            return res.status(400).json({ message: 'Nhóm cần có ít nhất 2 thành viên' });
        }

        // Kiểm tra các participant có tồn tại không
        const validUsers = await User.find({ _id: { $in: allParticipants } }).select('_id');
        if (validUsers.length !== allParticipants.length) {
            return res.status(400).json({ message: 'Một số người dùng không tồn tại' });
        }

        // Tạo group chat
        const groupChat = await Chat.create({
            name: name.trim(),
            description: description?.trim(),
            isGroup: true,
            creator: creatorId,
            admins: [creatorId],
            participants: allParticipants
        });

        // Populate thông tin
        const populatedChat = await Chat.findById(groupChat._id)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Invalidate caches
        for (const participantId of allParticipants) {
            await invalidateUserChatCache(participantId.toString());
        }

        // Emit socket event cho tất cả participants
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        allParticipants.forEach(participantId => {
            // Sử dụng groupChatNamespace cho group chat events
            groupChatNamespace.to(participantId.toString()).emit('groupMembersAdded', {
                chatId: groupChat._id,
                newMembers: allParticipants.filter(p => p.toString() !== participantId),
                addedBy: creatorId
            });
            // Vẫn sử dụng io thông thường cho newChat event
            io.to(participantId.toString()).emit('newChat', populatedChat);
        });

        res.status(201).json(populatedChat);
    } catch (error) {
        console.error('Error creating group chat:', error);
        res.status(500).json({ message: error.message });
    }
};

// Thêm thành viên vào group
exports.addGroupMember = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userIds } = req.body; // Array of user IDs to add
        const currentUserId = req.user._id;

        // Validate input
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'Danh sách người dùng không hợp lệ' });
        }

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Kiểm tra quyền thêm thành viên
        const isAdmin = chat.admins.includes(currentUserId);
        const canAddMembers = chat.settings.allowMembersToAdd || isAdmin;

        if (!canAddMembers && !chat.participants.includes(currentUserId)) {
            return res.status(403).json({ message: 'Bạn không có quyền thêm thành viên vào nhóm này' });
        }

        // Kiểm tra users có tồn tại không
        const validUsers = await User.find({ _id: { $in: userIds } }).select('_id');
        if (validUsers.length !== userIds.length) {
            return res.status(400).json({ message: 'Một số người dùng không tồn tại' });
        }

        // Lọc ra những user chưa có trong group
        const newMembers = userIds.filter(userId => 
            !chat.participants.some(p => p.toString() === userId.toString())
        );

        if (newMembers.length === 0) {
            return res.status(400).json({ message: 'Tất cả người dùng đã có trong nhóm' });
        }

        // Thêm members mới
        chat.participants.push(...newMembers);
        await chat.save();

        // Populate và trả về
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Invalidate caches
        for (const participantId of chat.participants) {
            await invalidateUserChatCache(participantId.toString());
        }

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupMembersAdded', {
                chatId: chat._id,
                newMembers,
                addedBy: currentUserId
            });
            io.to(participantId.toString()).emit('newChat', updatedChat);
        });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error('Error adding group member:', error);
        res.status(500).json({ message: error.message });
    }
};

// Xóa thành viên khỏi group
exports.removeGroupMember = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Kiểm tra quyền xóa thành viên (chỉ admin hoặc creator)
        const isAdmin = chat.admins.includes(currentUserId);
        const isCreator = chat.creator.toString() === currentUserId.toString();

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ message: 'Chỉ admin mới có thể xóa thành viên' });
        }

        // Không thể xóa creator
        if (userId === chat.creator.toString()) {
            return res.status(400).json({ message: 'Không thể xóa người tạo nhóm' });
        }

        // Xóa khỏi participants và admins
        chat.participants = chat.participants.filter(p => p.toString() !== userId);
        chat.admins = chat.admins.filter(a => a.toString() !== userId);
        await chat.save();

        // Populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Invalidate caches
        await invalidateUserChatCache(userId);
        for (const participantId of chat.participants) {
            await invalidateUserChatCache(participantId.toString());
        }

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupMemberRemoved', {
                chatId: chat._id,
                removedUserId: currentUserId,
                removedBy: currentUserId // User left by themselves
            });
            io.to(participantId.toString()).emit('newChat', updatedChat);
        });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error('Error removing group member:', error);
        res.status(500).json({ message: error.message });
    }
};

// Rời khỏi group
exports.leaveGroup = async (req, res) => {
    try {
        const { chatId } = req.params;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Creator không thể rời nhóm mà phải chuyển quyền owner trước
        if (chat.creator.toString() === currentUserId.toString()) {
            return res.status(400).json({ 
                message: 'Người tạo nhóm không thể rời khỏi nhóm. Vui lòng chuyển quyền owner trước.' 
            });
        }

        // Xóa khỏi participants và admins
        chat.participants = chat.participants.filter(p => p.toString() !== currentUserId.toString());
        chat.admins = chat.admins.filter(a => a.toString() !== currentUserId.toString());
        await chat.save();

        // Populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Invalidate caches
        await invalidateUserChatCache(currentUserId.toString());
        for (const participantId of chat.participants) {
            await invalidateUserChatCache(participantId.toString());
        }

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupMemberRemoved', {
                chatId: chat._id,
                removedUserId: currentUserId,
                removedBy: currentUserId // User left by themselves
            });
            io.to(participantId.toString()).emit('newChat', updatedChat);
        });

        res.status(200).json({ message: 'Đã rời khỏi nhóm thành công' });
    } catch (error) {
        console.error('Error leaving group:', error);
        res.status(500).json({ message: error.message });
    }
};

// Cập nhật thông tin group
exports.updateGroupInfo = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { name, description } = req.body;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Kiểm tra quyền sửa thông tin
        const isAdmin = chat.admins.includes(currentUserId);
        const canEdit = chat.settings.allowMembersToEdit || isAdmin;

        if (!canEdit) {
            return res.status(403).json({ message: 'Bạn không có quyền sửa thông tin nhóm' });
        }

        // Cập nhật thông tin
        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ message: 'Tên nhóm không được để trống' });
            }
            chat.name = name.trim();
        }

        if (description !== undefined) {
            chat.description = description.trim();
        }

        // Handle avatar upload
        if (req.file) {
            chat.avatar = `/uploads/Chat/${req.file.filename}`;
        }

        await chat.save();

        // Populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Invalidate caches
        for (const participantId of chat.participants) {
            await invalidateUserChatCache(participantId.toString());
        }

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupInfoUpdated', {
                chatId: chat._id,
                updatedBy: currentUserId,
                changes: { name, description, avatar: chat.avatar }
            });
            io.to(participantId.toString()).emit('newChat', updatedChat);
        });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error('Error updating group info:', error);
        res.status(500).json({ message: error.message });
    }
};

// Thêm admin
exports.addGroupAdmin = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Chỉ creator mới có thể thêm admin
        if (chat.creator.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: 'Chỉ người tạo nhóm mới có thể thêm admin' });
        }

        // Kiểm tra user có trong group không
        if (!chat.participants.includes(userId)) {
            return res.status(400).json({ message: 'Người dùng không có trong nhóm' });
        }

        // Kiểm tra đã là admin chưa
        if (chat.admins.includes(userId)) {
            return res.status(400).json({ message: 'Người dùng đã là admin' });
        }

        // Thêm admin
        chat.admins.push(userId);
        await chat.save();

        // Populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupAdminAdded', {
                chatId: chat._id,
                newAdminId: userId,
                addedBy: currentUserId
            });
        });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error('Error adding group admin:', error);
        res.status(500).json({ message: error.message });
    }
};

// Xóa admin
exports.removeGroupAdmin = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Chỉ creator mới có thể xóa admin
        if (chat.creator.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: 'Chỉ người tạo nhóm mới có thể xóa admin' });
        }

        // Không thể xóa creator khỏi admin
        if (userId === chat.creator.toString()) {
            return res.status(400).json({ message: 'Không thể xóa quyền admin của người tạo nhóm' });
        }

        // Xóa admin
        chat.admins = chat.admins.filter(a => a.toString() !== userId);
        await chat.save();

        // Populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        // Notify removed user
        groupChatNamespace.to(userId).emit('groupAdminRemoved', {
            chatId: chat._id,
            removedAdminId: userId,
            removedBy: currentUserId
        });

        // Notify remaining members
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupMembersAdded', {
                chatId: chat._id,
                newMembers: chat.participants.filter(p => p.toString() !== userId),
                addedBy: currentUserId
            });
            io.to(participantId.toString()).emit('newChat', updatedChat);
        });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error('Error removing group admin:', error);
        res.status(500).json({ message: error.message });
    }
};

// Cập nhật settings group
exports.updateGroupSettings = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { allowMembersToAdd, allowMembersToEdit, muteNotifications } = req.body;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Chỉ admin mới có thể cập nhật settings
        if (!chat.admins.includes(currentUserId)) {
            return res.status(403).json({ message: 'Chỉ admin mới có thể cập nhật cài đặt nhóm' });
        }

        // Cập nhật settings
        if (allowMembersToAdd !== undefined) {
            chat.settings.allowMembersToAdd = allowMembersToAdd;
        }
        if (allowMembersToEdit !== undefined) {
            chat.settings.allowMembersToEdit = allowMembersToEdit;
        }
        if (muteNotifications !== undefined) {
            chat.settings.muteNotifications = muteNotifications;
        }

        await chat.save();

        // Populate
        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        // Emit events
        const io = req.app.get('io');
        const groupChatNamespace = req.app.get('groupChatNamespace');
        
        chat.participants.forEach(participantId => {
            groupChatNamespace.to(participantId.toString()).emit('groupSettingsUpdated', {
                chatId: chat._id,
                updatedBy: currentUserId,
                settings: chat.settings
            });
        });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error('Error updating group settings:', error);
        res.status(500).json({ message: error.message });
    }
};

// Lấy danh sách thành viên group
exports.getGroupMembers = async (req, res) => {
    try {
        const { chatId } = req.params;
        const currentUserId = req.user._id;

        // Tìm group chat
        const chat = await Chat.findById(chatId)
            .populate('participants', 'fullname avatarUrl email department')
            .populate('creator', 'fullname avatarUrl email')
            .populate('admins', 'fullname avatarUrl email');

        if (!chat || !chat.isGroup) {
            return res.status(404).json({ message: 'Không tìm thấy nhóm chat' });
        }

        // Kiểm tra quyền truy cập
        if (!chat.participants.some(p => p._id.toString() === currentUserId.toString())) {
            return res.status(403).json({ message: 'Bạn không có quyền xem danh sách thành viên' });
        }

        res.status(200).json({
            members: chat.participants,
            admins: chat.admins,
            creator: chat.creator
        });
    } catch (error) {
        console.error('Error getting group members:', error);
        res.status(500).json({ message: error.message });
    }
};

// Tìm kiếm group chat
exports.searchGroups = async (req, res) => {
    try {
        const { q } = req.query; // search query
        const currentUserId = req.user._id;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ message: 'Từ khóa tìm kiếm không được để trống' });
        }

        // Tìm kiếm group có tên chứa từ khóa và user là thành viên
        const groups = await Chat.find({
            isGroup: true,
            participants: currentUserId,
            name: { $regex: q.trim(), $options: 'i' }
        })
        .populate('participants', 'fullname avatarUrl email')
        .populate('creator', 'fullname avatarUrl email')
        .populate('lastMessage')
        .sort({ updatedAt: -1 })
        .limit(20);

        res.status(200).json(groups);
    } catch (error) {
        console.error('Error searching groups:', error);
        res.status(500).json({ message: error.message });
    }
};

// Xóa các chat rỗng (không có tin nhắn) khỏi database
exports.cleanupEmptyChats = async (req, res) => {
    try {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 ngày trước
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 ngày trước
        
        // Tìm các chat rỗng cần xóa:
        // 1. Chat 1-1 rỗng được tạo cách đây hơn 1 giờ
        // 2. Group chat rỗng được tạo cách đây hơn 7 ngày
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 giờ trước
        
        const emptyChats = await Chat.find({
            $and: [
                // Điều kiện 1: Chat rỗng (không có lastMessage)
                {
                    $or: [
                        { lastMessage: { $exists: false } },
                        { lastMessage: null }
                    ]
                },
                // Điều kiện 2: Thời gian tạo phù hợp
                {
                    $or: [
                        // Chat 1-1 rỗng cũ hơn 1 giờ
                        {
                            isGroup: { $ne: true },
                            createdAt: { $lt: oneHourAgo }
                        },
                        // Group chat rỗng cũ hơn 7 ngày
                        {
                            isGroup: true,
                            createdAt: { $lt: oneWeekAgo }
                        }
                    ]
                }
            ]
        });

        if (emptyChats.length === 0) {
            return res.status(200).json({ 
                message: 'Không có chat rỗng nào cần xóa',
                deletedCount: 0 
            });
        }

        console.log(`🗑️ [Cleanup] Found ${emptyChats.length} empty chats to delete:`, {
            oneToOneChats: emptyChats.filter(chat => !chat.isGroup).length,
            groupChats: emptyChats.filter(chat => chat.isGroup).length
        });

        // Phân loại để log chi tiết
        const oneToOneChats = emptyChats.filter(chat => !chat.isGroup);
        const groupChats = emptyChats.filter(chat => chat.isGroup);
        
        console.log(`🗑️ [Cleanup] Will delete:`, {
            '1-1 chats': oneToOneChats.length + ' (older than 1 hour)',
            'group chats': groupChats.length + ' (older than 7 days)'
        });

        // Xóa các chat rỗng
        const result = await Chat.deleteMany({
            _id: { $in: emptyChats.map(chat => chat._id) }
        });

        // Invalidate cache cho tất cả users có trong các chat bị xóa
        const affectedUsers = new Set();
        emptyChats.forEach(chat => {
            chat.participants.forEach(participant => {
                affectedUsers.add(participant.toString());
            });
        });

        // Xóa cache cho các user bị ảnh hưởng
        for (const userId of affectedUsers) {
            await invalidateUserChatCache(userId);
        }

        console.log(`🗑️ [Cleanup] Deleted ${result.deletedCount} empty chats:`, {
            oneToOneDeleted: oneToOneChats.length,
            groupChatsDeleted: groupChats.length,
            affectedUsers: affectedUsers.size
        });

        res.status(200).json({ 
            message: `Đã xóa ${result.deletedCount} chat rỗng (${oneToOneChats.length} chat 1-1, ${groupChats.length} group chat)`,
            deletedCount: result.deletedCount,
            oneToOneChats: oneToOneChats.length,
            groupChats: groupChats.length,
            affectedUsers: affectedUsers.size
        });
    } catch (error) {
        console.error('Error cleaning up empty chats:', error);
        res.status(500).json({ message: error.message });
    }
};

// Hàm cleanup tự động (có thể gọi bằng cron job)
exports.autoCleanupEmptyChats = async () => {
    try {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 ngày trước
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 giờ trước
        
        // Tìm các chat rỗng cần xóa:
        // 1. Chat 1-1 rỗng được tạo cách đây hơn 1 giờ
        // 2. Group chat rỗng được tạo cách đây hơn 7 ngày
        const emptyChats = await Chat.find({
            $and: [
                // Điều kiện 1: Chat rỗng (không có lastMessage)
                {
                    $or: [
                        { lastMessage: { $exists: false } },
                        { lastMessage: null }
                    ]
                },
                // Điều kiện 2: Thời gian tạo phù hợp
                {
                    $or: [
                        // Chat 1-1 rỗng cũ hơn 1 giờ
                        {
                            isGroup: { $ne: true },
                            createdAt: { $lt: oneHourAgo }
                        },
                        // Group chat rỗng cũ hơn 7 ngày
                        {
                            isGroup: true,
                            createdAt: { $lt: oneWeekAgo }
                        }
                    ]
                }
            ]
        });

        if (emptyChats.length === 0) {
            console.log('🗑️ [Auto Cleanup] No empty chats to delete');
            return { deletedCount: 0 };
        }

        // Phân loại để log chi tiết
        const oneToOneChats = emptyChats.filter(chat => !chat.isGroup);
        const groupChats = emptyChats.filter(chat => chat.isGroup);

        console.log(`🗑️ [Auto Cleanup] Found ${emptyChats.length} empty chats to delete:`, {
            '1-1 chats': oneToOneChats.length + ' (older than 1 hour)',
            'group chats': groupChats.length + ' (older than 7 days)'
        });

        const result = await Chat.deleteMany({
            _id: { $in: emptyChats.map(chat => chat._id) }
        });

        // Invalidate cache cho tất cả users có trong các chat bị xóa
        const affectedUsers = new Set();
        emptyChats.forEach(chat => {
            chat.participants.forEach(participant => {
                affectedUsers.add(participant.toString());
            });
        });

        for (const userId of affectedUsers) {
            await invalidateUserChatCache(userId);
        }

        console.log(`🗑️ [Auto Cleanup] Deleted ${result.deletedCount} empty chats:`, {
            oneToOneDeleted: oneToOneChats.length,
            groupChatsDeleted: groupChats.length,
            affectedUsers: affectedUsers.size
        });
        
        return { 
            deletedCount: result.deletedCount,
            oneToOneChats: oneToOneChats.length,
            groupChats: groupChats.length,
            affectedUsers: affectedUsers.size 
        };
    } catch (error) {
        console.error('Error in auto cleanup empty chats:', error);
        return { error: error.message };
    }
};