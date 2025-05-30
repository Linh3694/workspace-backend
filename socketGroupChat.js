const jwt = require("jsonwebtoken");
const redisService = require('./services/redisService');
const logger = require('./logger');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

// Rate limiting cho socket events
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 giây
const MAX_EVENTS_PER_WINDOW = 10; // Tối đa 10 events/giây

// Typing timeout management
const typingTimeouts = new Map();
const TYPING_TIMEOUT = 3000; // 3 giây

// Helper function để check rate limit
const checkRateLimit = (socketId, eventType) => {
    const key = `${socketId}:${eventType}`;
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
        rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    
    const limit = rateLimitMap.get(key);
    if (now > limit.resetTime) {
        limit.count = 1;
        limit.resetTime = now + RATE_LIMIT_WINDOW;
        return true;
    }
    
    if (limit.count >= MAX_EVENTS_PER_WINDOW) {
        return false;
    }
    
    limit.count++;
    return true;
};

// Cleanup rate limit map periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimitMap.entries()) {
        if (now > limit.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, RATE_LIMIT_WINDOW);

// Redis clients for group chat
const pubClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    connectTimeout: 60000,
    lazyConnect: true,
    reconnectStrategy: (retries) => {
      const delay = Math.min(retries * 50, 2000);
      console.log(`🔄 [GroupChat Redis] Retry ${retries}: waiting ${delay}ms`);
      return delay;
    }
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

const subClient = pubClient.duplicate();

// Xử lý lỗi Redis
pubClient.on('error', (err) => {
  logger.error(`[GroupChat] Redis PubClient error: ${err.message}`);
});

subClient.on('error', (err) => {
  logger.error(`[GroupChat] Redis SubClient error: ${err.message}`);
});

// Xử lý reconnect
pubClient.on('reconnecting', () => {
  logger.info('[GroupChat] Redis PubClient reconnecting...');
});

subClient.on('reconnecting', () => {
  logger.info('[GroupChat] Redis SubClient reconnecting...');
});

// Xử lý connect thành công
pubClient.on('connect', () => {
  logger.info('[GroupChat] Redis PubClient connected');
});

subClient.on('connect', () => {
  logger.info('[GroupChat] Redis SubClient connected');
});

const typingUsers = {};
const userActivityTimeouts = {};
const USER_OFFLINE_TIMEOUT = 20 * 1000; // 20 giây

// Hàm publish an toàn với xử lý lỗi
const safePublish = async (channel, message) => {
  try {
    await pubClient.publish(channel, JSON.stringify(message));
  } catch (err) {
    logger.error(`[GroupChat] Error publishing to ${channel}: ${err.message}`);
  }
};

module.exports = async function (groupChatNamespace) {
  try {
    await pubClient.connect();
    await subClient.connect();
    groupChatNamespace.adapter(createAdapter(pubClient, subClient));

    // Hàm để đánh dấu người dùng offline sau một khoảng thời gian
    const setUserInactiveTimeout = async (userId) => {
      // Xóa timeout cũ nếu có
      if (userActivityTimeouts[userId]) {
        clearTimeout(userActivityTimeouts[userId]);
      }

      // Thiết lập timeout mới
      userActivityTimeouts[userId] = setTimeout(async () => {
        try {
          await redisService.setUserOnlineStatus(userId, false, Date.now());
          await safePublish('user:offline', { userId });
          logger.info(`[GroupChat] User marked as offline due to inactivity: ${userId}`);
          groupChatNamespace.emit("userOffline", { userId });
        } catch (err) {
          logger.error(`[GroupChat] Error setting user offline: ${err.message}`);
        }
        delete userActivityTimeouts[userId];
      }, USER_OFFLINE_TIMEOUT);
    };

    groupChatNamespace.on("connection", async (socket) => {
      console.log("[GroupChat] Socket connected:", socket.id);
      let currentUserId = null;

      // Lắng nghe lỗi socket
      socket.on('error', (err) => {
        logger.error(`[GroupChat][${socket.id}] error: ${err.message}`);
        socket.emit('error', { code: 500, message: 'Lỗi kết nối socket', detail: err.message });
      });

      try {
        const token = socket.handshake.query.token;
        console.log(`🔑 [GroupChat AUTH][${socket.id}] Token received:`, token ? 'YES' : 'NO');
        
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          console.log(`🔑 [GroupChat AUTH][${socket.id}] Token decoded:`, decoded ? 'YES' : 'NO');
          
          if (decoded && decoded._id) {
            currentUserId = decoded._id.toString();
            socket.join(currentUserId);
            socket.data.userId = currentUserId;
            
            console.log(`✅ [GroupChat AUTH][${socket.id}] User authenticated:`, currentUserId);

            // Đánh dấu online trên Redis và publish event
            await redisService.setUserOnlineStatus(currentUserId, true, Date.now());
            await redisService.setUserSocketId(currentUserId, socket.id);
            await pubClient.publish('user:online', JSON.stringify({ userId: currentUserId }));

            logger.info(`[GroupChat][${socket.id}] User online: ${currentUserId}`);
            groupChatNamespace.emit("userOnline", { userId: currentUserId });

            // Thiết lập timeout cho user
            setUserInactiveTimeout(currentUserId);
          } else {
            console.log(`❌ [GroupChat AUTH][${socket.id}] Token decoded but no _id found`);
          }
        } else {
          console.log(`❌ [GroupChat AUTH][${socket.id}] No token provided`);
        }
      } catch (err) {
        console.error(`❌ [GroupChat AUTH][${socket.id}] Token verify error:`, err.message);
        logger.error(`[GroupChat][${socket.id}] Token verify error: ${err.message}`);
        socket.emit('error', { code: 401, message: 'Token không hợp lệ', detail: err.message });
      }

      // Debug log sau khi authentication
      console.log(`🔍 [GroupChat AUTH][${socket.id}] Final auth status:`, {
        currentUserId,
        'socket.data.userId': socket.data.userId,
        authenticated: !!socket.data.userId
      });

      // Reset inactivity timeout khi user có hoạt động
      const resetUserActivity = () => {
        if (socket.data.userId) {
          setUserInactiveTimeout(socket.data.userId);
        }
      };

      // ====================== GROUP CHAT SOCKET EVENTS ======================
      
      // Join group chat room
      socket.on("joinGroupChat", async (data) => {
        try {
          const { chatId } = data;
          console.log(`🏠 [JOIN GROUP][${socket.id}] Joining group chat:`, {
            chatId,
            userId: socket.data.userId,
            hasUserId: !!socket.data.userId
          });
          
          if (!chatId || !socket.data.userId) {
            console.log(`❌ [JOIN GROUP][${socket.id}] Missing data:`, {
              chatId: !!chatId,
              userId: !!socket.data.userId
            });
            return;
          }

          // Verify user is member of this group
          const Chat = require('./models/Chat');
          const chat = await Chat.findById(chatId);
          
          if (!chat || !chat.isGroup) {
            socket.emit('error', { message: 'Group chat không tồn tại' });
            return;
          }

          const isMember = chat.participants.includes(socket.data.userId);
          if (!isMember) {
            socket.emit('error', { message: 'Bạn không phải thành viên của nhóm này' });
            return;
          }

          socket.join(chatId);
          console.log(`✅ [JOIN GROUP][${socket.id}] User ${socket.data.userId} joined group chat ${chatId}`);
          
          // Notify other members
          socket.to(chatId).emit("userJoinedGroup", {
            userId: socket.data.userId,
            chatId,
            timestamp: new Date().toISOString()
          });

          resetUserActivity();
        } catch (error) {
          console.error('[GroupChat] Error joining group chat:', error);
          socket.emit('error', { message: 'Lỗi khi tham gia group chat' });
        }
      });

      // Leave group chat room
      socket.on("leaveGroupChat", (data) => {
        const { chatId } = data;
        console.log(`🚪 [LEAVE GROUP][${socket.id}] Leave group chat:`, {
          chatId,
          userId: socket.data.userId,
          hasUserId: !!socket.data.userId
        });
        
        if (!chatId) return;

        socket.leave(chatId);
        console.log(`👥 [GroupChat] User ${socket.data.userId} left group chat ${chatId}`);
        
        // Notify other members
        socket.to(chatId).emit("userLeftGroup", {
          userId: socket.data.userId,
          chatId,
          timestamp: new Date().toISOString()
        });

        resetUserActivity();
      });

      // Group typing indicator
      socket.on("groupTyping", (data) => {
        if (!checkRateLimit(socket.id, 'groupTyping')) {
          socket.emit('rateLimitExceeded', { message: 'Too many typing events' });
          return;
        }

        const { chatId, isTyping } = data;
        if (!chatId || !socket.data.userId) return;

        if (isTyping) {
          socket.to(chatId).emit("userTypingInGroup", {
            userId: socket.data.userId,
            chatId,
            timestamp: new Date().toISOString()
          });
        } else {
          socket.to(chatId).emit("userStopTypingInGroup", {
            userId: socket.data.userId,
            chatId,
            timestamp: new Date().toISOString()
          });
        }

        resetUserActivity();
      });

      // Group message read status
      socket.on("groupMessageRead", (data) => {
        const { chatId, messageId } = data;
        if (!chatId || !messageId || !socket.data.userId) return;

        socket.to(chatId).emit("groupMessageRead", {
          userId: socket.data.userId,
          chatId,
          messageId,
          timestamp: new Date().toISOString()
        });

        resetUserActivity();
      });

      // Join user room để nhận notifications
      socket.on("joinUserRoom", (userId) => {
        if (userId && socket.data.userId === userId) {
          socket.join(userId);
          console.log(`👤 [GroupChat] User ${userId} joined their personal room`);
        }
      });

      // Gửi tin nhắn group chat
      socket.on("sendGroupMessage", async (messageData) => {
        try {
          if (!checkRateLimit(socket.id, 'sendGroupMessage')) {
            socket.emit('rateLimitExceeded', { message: 'Too many messages' });
            return;
          }

          const { chatId, content, type = 'text', replyTo, fileUrls, isEmoji } = messageData;
          
          if (!chatId || !socket.data.userId) return;

          // Verify user is member of this group
          const Chat = require('./models/Chat');
          const chat = await Chat.findById(chatId);
          
          if (!chat || !chat.isGroup) {
            socket.emit('error', { message: 'Group chat không tồn tại' });
            return;
          }

          const isMember = chat.participants.includes(socket.data.userId);
          if (!isMember) {
            socket.emit('error', { message: 'Bạn không phải thành viên của nhóm này' });
            return;
          }

          // Tạo message mới
          const Message = require('./models/Message');
          const newMessage = await Message.create({
            sender: socket.data.userId,
            chat: chatId,
            content,
            type,
            replyTo,
            fileUrls,
            isEmoji: isEmoji || false,
            isGroup: true // Đánh dấu đây là group message
          });

          // Populate sender info
          const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender', 'fullname avatarUrl')
            .populate('replyTo')
            .lean();

          // Cập nhật lastMessage của chat
          await Chat.findByIdAndUpdate(chatId, {
            lastMessage: newMessage._id,
            updatedAt: new Date()
          });

          // Gửi message đến tất cả members trong group
          groupChatNamespace.to(chatId).emit("receiveMessage", populatedMessage);

          // Gửi notification đến những user không online trong group
          const User = require('./models/User');
          const members = await User.find({
            _id: { $in: chat.participants },
            _id: { $ne: socket.data.userId }
          }).select('_id fullname');

          for (const member of members) {
            const isOnline = await redisService.getUserOnlineStatus(member._id.toString());
            if (!isOnline) {
              // Gửi push notification cho user offline
              // TODO: Implement push notification service
            }
          }

          resetUserActivity();
        } catch (error) {
          console.error('[GroupChat] Error sending group message:', error);
          socket.emit('error', { message: 'Lỗi khi gửi tin nhắn' });
        }
      });

      // ====================== END GROUP CHAT EVENTS ======================

      // Enhanced disconnect handling
      socket.on("disconnect", (reason) => {
        console.log(`🔌 [GroupChat] Socket ${socket.id} disconnected:`, reason);
        
        if (socket.data.userId) {
          // Xóa timeout của user khi disconnect
          if (userActivityTimeouts[socket.data.userId]) {
            clearTimeout(userActivityTimeouts[socket.data.userId]);
            delete userActivityTimeouts[socket.data.userId];
          }

          // Đánh dấu user offline ngay lập tức
          redisService.setUserOnlineStatus(socket.data.userId, false, Date.now())
            .then(() => {
              safePublish('user:offline', { userId: socket.data.userId });
              logger.info(`[GroupChat] User marked as offline on disconnect: ${socket.data.userId}`);
              groupChatNamespace.emit("userOffline", { userId: socket.data.userId });
            })
            .catch(err => {
              logger.error(`[GroupChat] Error setting user offline on disconnect: ${err.message}`);
            });
        }
      });

      // Cleanup on disconnecting
      socket.on("disconnecting", () => {
        console.log(`🔌 [GroupChat] Socket ${socket.id} disconnecting, leaving rooms:`, [...socket.rooms]);
      });

      // Ping/pong để maintain connection
      socket.on("ping", () => {
        socket.emit("pong");
        resetUserActivity();
      });
    });

    logger.info('[GroupChat] Socket handlers initialized successfully');
  } catch (error) {
    logger.error(`[GroupChat] Error initializing socket: ${error.message}`);
  }
}; 