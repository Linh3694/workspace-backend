const jwt = require("jsonwebtoken");
const redisService = require('./services/redisService');
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
  console.error(`[GroupChat] Redis PubClient error: ${err.message}`);
});

subClient.on('error', (err) => {
  console.error(`[GroupChat] Redis SubClient error: ${err.message}`);
});

// Xử lý reconnect
pubClient.on('reconnecting', () => {
  console.info('[GroupChat] Redis PubClient reconnecting...');
});

subClient.on('reconnecting', () => {
  console.info('[GroupChat] Redis SubClient reconnecting...');
});

// Xử lý connect thành công
pubClient.on('connect', () => {
  console.info('[GroupChat] Redis PubClient connected');
});

subClient.on('connect', () => {
  console.info('[GroupChat] Redis SubClient connected');
});

const typingUsers = {};
const userActivityTimeouts = {};
const USER_OFFLINE_TIMEOUT = 20 * 1000; // 20 giây

// Hàm publish an toàn với xử lý lỗi
const safePublish = async (channel, message) => {
  try {
    await pubClient.publish(channel, JSON.stringify(message));
  } catch (err) {
    console.error(`[GroupChat] Error publishing to ${channel}: ${err.message}`);
  }
};

module.exports = async function (groupChatNamespace) {
  console.log('🚀 [GroupChat] Initializing socketGroupChat module...');
  
  try {
    console.log('🔗 [GroupChat] Connecting to Redis clients...');
    
    // Connect Redis clients nếu chưa connected
    if (!pubClient.isOpen) {
      await pubClient.connect();
    }
    if (!subClient.isOpen) {
      await subClient.connect();
    }
    
    console.log('✅ [GroupChat] Redis clients ready');

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
          console.info(`[GroupChat] User marked as offline due to inactivity: ${userId}`);
          groupChatNamespace.emit("userOffline", { userId });
        } catch (err) {
          console.error(`[GroupChat] Error setting user offline: ${err.message}`);
        }
        delete userActivityTimeouts[userId];
      }, USER_OFFLINE_TIMEOUT);
    };

    console.log('🎧 [GroupChat] Setting up connection event listener...');
    groupChatNamespace.on("connection", async (socket) => {
      console.log("🔗 [GroupChat] Socket connected:", socket.id);
      
      // User đã được authenticate trong middleware
      const currentUserId = socket.data.userId;
      console.log(`✅ [GroupChat] Authenticated user: ${currentUserId} for socket ${socket.id}`);

      // Debug all incoming events
      socket.onAny((eventName, ...args) => {
        console.log(`🔍 [GroupChat][${socket.id}] ========= RECEIVED EVENT =========`);
        console.log(`🔍 [GroupChat][${socket.id}] Event: ${eventName}`);
        console.log(`🔍 [GroupChat][${socket.id}] Args:`, args);
        console.log(`🔍 [GroupChat][${socket.id}] User authenticated:`, !!currentUserId);
        console.log(`🔍 [GroupChat][${socket.id}] =========================================`);
      });

      // Lắng nghe lỗi socket
      socket.on('error', (err) => {
        console.error(`[GroupChat][${socket.id}] error: ${err.message}`);
        socket.emit('error', { code: 500, message: 'Lỗi kết nối socket', detail: err.message });
      });

      if (currentUserId) {
        // Đánh dấu online trên Redis và publish event
        await redisService.setUserOnlineStatus(currentUserId, true, Date.now());
        await redisService.setUserSocketId(currentUserId, socket.id);
        await pubClient.publish('user:online', JSON.stringify({ userId: currentUserId }));

        console.info(`[GroupChat][${socket.id}] User online: ${currentUserId}`);
        groupChatNamespace.emit("userOnline", { userId: currentUserId });

        // Thiết lập timeout cho user
        setUserInactiveTimeout(currentUserId);
      }

      // ====================== GROUP CHAT SOCKET EVENTS ======================
      
      // Reset inactivity timeout khi user có hoạt động
      const resetUserActivity = () => {
        if (currentUserId) {
          setUserInactiveTimeout(currentUserId);
        }
      };
      
      // Debug room membership function  
      const debugRoomMembership = (roomId) => {
        const room = groupChatNamespace.adapter.rooms.get(roomId);
        const members = room ? Array.from(room) : [];
        console.log(`🏠 [GroupChat Debug] Room ${roomId} membership:`, {
          roomExists: !!room,
          memberCount: members.length,
          members: members,
          allRooms: Array.from(groupChatNamespace.adapter.rooms.keys())
        });
        return members;
      };

      // Enhanced join group chat room
      socket.on("joinGroupChat", async (data) => {
        try {
          const { chatId } = data;
          console.log(`🏠 [JOIN GROUP][${socket.id}] Joining group chat:`, {
            chatId,
            userId: currentUserId,
            hasUserId: !!currentUserId,
            socketRooms: Array.from(socket.rooms),
            timestamp: new Date().toISOString()
          });
          
          if (!chatId || !currentUserId) {
            console.log(`❌ [JOIN GROUP][${socket.id}] Missing data:`, {
              chatId: !!chatId,
              userId: !!currentUserId
            });
            return;
          }

          // Verify user is member of this group
          const Chat = require('./models/Chat');
          const chat = await Chat.findById(chatId);
          
          if (!chat || !chat.isGroup) {
            console.log(`❌ [JOIN GROUP][${socket.id}] Invalid group chat:`, {
              chatExists: !!chat,
              isGroup: chat?.isGroup
            });
            socket.emit('error', { message: 'Group chat không tồn tại' });
            return;
          }

          const isMember = chat.participants.includes(currentUserId);
          if (!isMember) {
            console.log(`❌ [JOIN GROUP][${socket.id}] User not a member:`, {
              userId: currentUserId,
              participants: chat.participants
            });
            socket.emit('error', { message: 'Bạn không phải thành viên của nhóm này' });
            return;
          }

          socket.join(chatId);
          console.log(`✅ [JOIN GROUP][${socket.id}] User ${currentUserId} joined group chat ${chatId}`);
          console.log(`✅ [JOIN GROUP][${socket.id}] Room ${chatId} now has ${socket.adapter.rooms.get(chatId)?.size || 0} members`);
          console.log(`✅ [JOIN GROUP][${socket.id}] Socket rooms after join:`, Array.from(socket.rooms));
          
          // Debug room membership
          debugRoomMembership(chatId);
          
          // Test emit to confirm room membership
          socket.emit('roomJoinConfirmed', {
            chatId,
            userId: currentUserId,
            socketId: socket.id,
            roomSize: socket.adapter.rooms.get(chatId)?.size || 0,
            timestamp: new Date().toISOString()
          });
          console.log(`✅ [JOIN GROUP][${socket.id}] Sent roomJoinConfirmed to client`);
          
          // Notify other members
          socket.to(chatId).emit("userJoinedGroup", {
            userId: currentUserId,
            chatId,
            timestamp: new Date().toISOString()
          });
          console.log(`📢 [JOIN GROUP][${socket.id}] Notified other members in room ${chatId}`);

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
          userId: currentUserId,
          hasUserId: !!currentUserId
        });
        
        if (!chatId) return;

        socket.leave(chatId);
        console.log(`👥 [GroupChat] User ${currentUserId} left group chat ${chatId}`);
        
        // Notify other members
        socket.to(chatId).emit("userLeftGroup", {
          userId: currentUserId,
          chatId,
          timestamp: new Date().toISOString()
        });

        resetUserActivity();
      });

      // Group typing indicator
      socket.on("groupTyping", (data) => {
        console.log('⌨️ [GroupChat Backend] Received groupTyping event:', {
          socketId: socket.id,
          userId: currentUserId,
          data,
          timestamp: new Date().toISOString()
        });

        if (!checkRateLimit(socket.id, 'groupTyping')) {
          console.log('⌨️ [GroupChat Backend] Rate limit exceeded for typing event');
          socket.emit('rateLimitExceeded', { message: 'Too many typing events' });
          return;
        }

        const { chatId, isTyping } = data;
        if (!chatId || !currentUserId) {
          console.log('⌨️ [GroupChat Backend] Missing required data:', {
            hasChatId: !!chatId,
            hasUserId: !!currentUserId
          });
          return;
        }

        console.log('⌨️ [GroupChat Backend] Processing typing event:', {
          chatId,
          userId: currentUserId,
          isTyping,
          roomMembers: socket.adapter.rooms.get(chatId)?.size || 0
        });

        if (isTyping) {
          console.log('⌨️ [GroupChat Backend] Emitting userTypingInGroup to room:', chatId);
          socket.to(chatId).emit("userTypingInGroup", {
            userId: currentUserId,
            chatId,
            timestamp: new Date().toISOString()
          });
          console.log('⌨️ [GroupChat Backend] ✅ Emitted userTypingInGroup event');
        } else {
          console.log('⌨️ [GroupChat Backend] Emitting userStopTypingInGroup to room:', chatId);
          socket.to(chatId).emit("userStopTypingInGroup", {
            userId: currentUserId,
            chatId,
            timestamp: new Date().toISOString()
          });
          console.log('⌨️ [GroupChat Backend] ✅ Emitted userStopTypingInGroup event');
        }

        resetUserActivity();
      });

      // Group message read status
      socket.on("groupMessageRead", (data) => {
        const { chatId, messageId } = data;
        if (!chatId || !messageId || !currentUserId) return;

        socket.to(chatId).emit("groupMessageRead", {
          userId: currentUserId,
          chatId,
          messageId,
          timestamp: new Date().toISOString()
        });

        resetUserActivity();
      });

      // Join user room để nhận notifications
      socket.on("joinUserRoom", (userId) => {
        if (userId && currentUserId === userId) {
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
          
          if (!chatId || !currentUserId) return;

          // Verify user is member of this group
          const Chat = require('./models/Chat');
          const chat = await Chat.findById(chatId);
          
          if (!chat || !chat.isGroup) {
            socket.emit('error', { message: 'Group chat không tồn tại' });
            return;
          }

          const isMember = chat.participants.includes(currentUserId);
          if (!isMember) {
            socket.emit('error', { message: 'Bạn không phải thành viên của nhóm này' });
            return;
          }

          // Tạo message mới
          const Message = require('./models/Message');
          const newMessage = await Message.create({
            sender: currentUserId,
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
            _id: { $ne: currentUserId }
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
        
        if (currentUserId) {
          // Xóa timeout của user khi disconnect
          if (userActivityTimeouts[currentUserId]) {
            clearTimeout(userActivityTimeouts[currentUserId]);
            delete userActivityTimeouts[currentUserId];
          }

          // Đánh dấu user offline ngay lập tức
          redisService.setUserOnlineStatus(currentUserId, false, Date.now())
            .then(() => {
              safePublish('user:offline', { userId: currentUserId });
              console.info(`[GroupChat] User marked as offline on disconnect: ${currentUserId}`);
              groupChatNamespace.emit("userOffline", { userId: currentUserId });
            })
            .catch(err => {
              console.error(`[GroupChat] Error setting user offline on disconnect: ${err.message}`);
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

    console.log('✅ [GroupChat] Connection event listener setup complete');
    console.info('[GroupChat] Socket handlers initialized successfully');
  } catch (error) {
    console.error('❌ [GroupChat] Error initializing socket:', error);
    console.error(`[GroupChat] Error initializing socket: ${error.message}`);
  }
}; 