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

// Redis Pub/Sub cho adapter
const pubClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    reconnectStrategy: (retries) => {
      // Tăng thời gian chờ giữa các lần reconnect
      const delay = Math.min(retries * 50, 2000);
      return delay;
    }
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

const subClient = pubClient.duplicate();

// Xử lý lỗi Redis
pubClient.on('error', (err) => {
});

subClient.on('error', (err) => {
});

// Xử lý reconnect
pubClient.on('reconnecting', () => {
  console.info('Redis PubClient reconnecting...');
});

subClient.on('reconnecting', () => {
  console.info('Redis SubClient reconnecting...');
});

// Xử lý connect thành công
pubClient.on('connect', () => {
  console.info('Redis PubClient connected');
});

subClient.on('connect', () => {
  console.info('Redis SubClient connected');
});

const typingUsers = {};
const userActivityTimeouts = {};
const USER_OFFLINE_TIMEOUT = 20 * 1000; // Giảm từ 60 giây xuống 20 giây để responsive hơn

// Hàm publish an toàn với xử lý lỗi
const safePublish = async (channel, message) => {
  try {
    await pubClient.publish(channel, JSON.stringify(message));
  } catch (err) {
    console.error(`Error publishing to ${channel}: ${err.message}`);
    // Có thể thêm logic retry ở đây nếu cần
  }
};

module.exports = async function (io) {
  try {
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));

    // Hàm để đánh dấu người dùng offline sau một khoảng thời gian
    const setUserInactiveTimeout = async (userId) => {
      // Xóa timeout cũ nếu có
      if (userActivityTimeouts[userId]) {
        clearTimeout(userActivityTimeouts[userId]);
      }

      // Thiết lập timeout mới
      userActivityTimeouts[userId] = setTimeout(async () => {
        const status = await redisService.getUserOnlineStatus(userId);
        if (status && status.isOnline) {
          console.log(`Auto marking user ${userId} as offline due to inactivity`);

          // Lưu thời gian last seen khi tự động offline
          await redisService.setUserOnlineStatus(userId, false, Date.now());
          await redisService.deleteUserSocketId(userId);
          await pubClient.publish('user:offline', JSON.stringify({ userId, lastSeen: Date.now() }));

          // Thông báo cho tất cả client
          io.emit("userOffline", { userId });
          io.emit("userLastSeen", { userId, lastSeen: new Date().toISOString() });

          // Xóa timeout
          delete userActivityTimeouts[userId];
        }
      }, USER_OFFLINE_TIMEOUT);
    };

    io.on("connection", async (socket) => {
      console.log("Socket connected:", socket.id);
      let currentUserId = null;

      // Lắng nghe lỗi socket
      socket.on('error', (err) => {
        console.error(`[Socket][${socket.id}] error: ${err.message}`);
        socket.emit('error', { code: 500, message: 'Lỗi kết nối socket', detail: err.message });
      });

      try {
        const token = socket.handshake.query.token;
        console.log(`🔑 [AUTH][${socket.id}] Token received:`, token ? 'YES' : 'NO');
        console.log(`🔑 [AUTH][${socket.id}] Token value:`, token);
        
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          console.log(`🔑 [AUTH][${socket.id}] Token decoded:`, decoded ? 'YES' : 'NO');
          console.log(`🔑 [AUTH][${socket.id}] Decoded content:`, decoded);
          
          if (decoded && decoded._id) {
            currentUserId = decoded._id.toString();
            socket.join(currentUserId);
            socket.data.userId = currentUserId;
            
            console.log(`✅ [AUTH][${socket.id}] User authenticated:`, currentUserId);
            console.log(`✅ [AUTH][${socket.id}] socket.data.userId set to:`, socket.data.userId);

            // Đánh dấu online trên Redis và publish event
            await redisService.setUserOnlineStatus(currentUserId, true, Date.now());
            await redisService.setUserSocketId(currentUserId, socket.id);
            await pubClient.publish('user:online', JSON.stringify({ userId: currentUserId }));

            console.info(`[Socket][${socket.id}] User online: ${currentUserId}`);
            io.emit("userOnline", { userId: currentUserId });

            // Thiết lập timeout cho user
            setUserInactiveTimeout(currentUserId);
          } else {
            console.log(`❌ [AUTH][${socket.id}] Token decoded but no _id found`);
          }
        } else {
          console.log(`❌ [AUTH][${socket.id}] No token provided`);
        }
      } catch (err) {
        console.error(`❌ [AUTH][${socket.id}] Token verify error:`, err.message);
        console.error(`❌ [AUTH][${socket.id}] Full error:`, err);
        console.error(`[Socket][${socket.id}] Token verify error: ${err.message}`);
        socket.emit('error', { code: 401, message: 'Token không hợp lệ', detail: err.message });
      }

      // Debug log sau khi authentication
      console.log(`🔍 [AUTH][${socket.id}] Final auth status:`, {
        currentUserId,
        'socket.data.userId': socket.data.userId,
        authenticated: !!socket.data.userId
      });

      // Join vào phòng chat
      socket.on("joinChat", (chatId) => {
        console.log(`🏠 Socket ${socket.id} joining chat room: ${chatId}`);
        socket.join(chatId);

        // Reset timeout khi có hoạt động
        if (socket.data.userId) {
          setUserInactiveTimeout(socket.data.userId);
        }
      });

      // Người dùng thêm reaction cho tin nhắn
      socket.on("addReaction", async ({ messageId, emoji }) => {
        if (!socket.data.userId) return;

        try {
          // Tìm tin nhắn trong database
          const Message = require('./models/Message');
          const message = await Message.findById(messageId);

          if (!message) return;

          const userId = socket.data.userId;

          // Kiểm tra xem người dùng đã reaction chưa
          const existingReactionIndex = message.reactions.findIndex(
            reaction => reaction.user.toString() === userId
          );

          if (existingReactionIndex !== -1) {
            // Nếu đã reaction với emoji khác, cập nhật emoji mới
            message.reactions[existingReactionIndex].emoji = emoji;
          } else {
            // Nếu chưa reaction, thêm reaction mới
            message.reactions.push({
              user: userId,
              emoji
            });
          }

          await message.save();

          // Populate thông tin người dùng
          const populatedMessage = await Message.findById(messageId)
            .populate('reactions.user', 'fullname avatarUrl email');

          // Gửi thông báo tới phòng chat
          io.to(message.chat.toString()).emit('messageReaction', {
            messageId,
            reactions: populatedMessage.reactions
          });

          // Reset timeout khi có hoạt động
          setUserInactiveTimeout(userId);
        } catch (error) {
          console.error('Error processing reaction:', error);
        }
      });

      // Người dùng xóa reaction khỏi tin nhắn
      socket.on("removeReaction", async ({ messageId }) => {
        if (!socket.data.userId) return;

        try {
          // Tìm tin nhắn trong database
          const Message = require('./models/Message');
          const message = await Message.findById(messageId);

          if (!message) return;

          const userId = socket.data.userId;

          // Lọc ra các reactions không phải của người dùng hiện tại
          message.reactions = message.reactions.filter(
            reaction => reaction.user.toString() !== userId
          );

          await message.save();

          // Gửi thông báo tới phòng chat
          io.to(message.chat.toString()).emit('messageReaction', {
            messageId,
            reactions: message.reactions
          });

          // Reset timeout khi có hoạt động
          setUserInactiveTimeout(userId);
        } catch (error) {
          console.error('Error removing reaction:', error);
        }
      });

      // Xử lý ping để duy trì trạng thái online
      socket.on("ping", async ({ userId }) => {
        if (userId) {
          await redisService.setUserOnlineStatus(userId, true, Date.now());
          await pubClient.publish('user:online', JSON.stringify({ userId }));
          console.info(`[Socket][${socket.id}] Ping from user: ${userId}`);
        }
      });

      // Xử lý khi app vào background
      socket.on("userBackground", async ({ userId }) => {
        if (userId) {
          console.log(`User ${userId} went to background`);

          // Rút ngắn thời gian timeout khi ở background (8 giây)
          if (userActivityTimeouts[userId]) {
            clearTimeout(userActivityTimeouts[userId]);
          }

          userActivityTimeouts[userId] = setTimeout(async () => {
            const status = await redisService.getUserOnlineStatus(userId);
            if (status && status.isOnline) {
              console.log(`Marking user ${userId} as offline from background`);
              await redisService.setUserOnlineStatus(userId, false, Date.now());
              await redisService.deleteUserSocketId(userId);
              await pubClient.publish('user:offline', JSON.stringify({ userId, lastSeen: Date.now() }));
              io.emit("userOffline", { userId });
              io.emit("userLastSeen", { userId, lastSeen: new Date().toISOString() });
              delete userActivityTimeouts[userId];
            }
          }, 8000); // Giảm từ 15 giây xuống 8 giây khi ở background
        }
      });

      // Kiểm tra trạng thái online của người dùng
      socket.on("checkUserStatus", async ({ userId }) => {
        const status = await redisService.getUserOnlineStatus(userId);
        socket.emit("userStatus", {
          userId,
          status: status && status.isOnline ? "online" : "offline"
        });
        if (!status?.isOnline && status?.lastSeen) {
          socket.emit("userLastSeen", { userId, lastSeen: status.lastSeen });
        }
        if (socket.data.userId) setUserInactiveTimeout(socket.data.userId);
      });

      // Trả về danh sách người dùng đang online
      socket.on("getUsersOnlineStatus", async () => {
        const onlineUsers = await redisService.getAllOnlineUsers();
        socket.emit("onlineUsers", onlineUsers);

        // Cũng trả về last seen cho các user offline
        const offlineUsers = await redisService.getAllOfflineUsers();
        for (const userId of offlineUsers) {
          const status = await redisService.getUserOnlineStatus(userId);
          if (status?.lastSeen) {
            socket.emit("userLastSeen", {
              userId,
              lastSeen: status.lastSeen
            });
          }
        }

        // Reset timeout khi có hoạt động
        if (socket.data.userId) {
          setUserInactiveTimeout(socket.data.userId);
        }
      });

      // Typing indicator
      socket.on("typing", ({ chatId, userId }) => {
        if (userId && chatId) {
          console.log(`🟢 [TYPING] User ${userId} is typing in chat ${chatId}, emitting to room`);

          // Set trạng thái typing và timeout
          if (!typingUsers[chatId]) {
            typingUsers[chatId] = {};
          }

          // Lưu trạng thái typing
          typingUsers[chatId][userId] = true;

          // Broadcast typing event to the chat room with chatId
          socket.to(chatId).emit("userTyping", { userId, chatId });
          console.log(`📤 [TYPING] Emitted userTyping to room ${chatId} for user ${userId}`);

          // Reset timeout khi có hoạt động
          setUserInactiveTimeout(userId);
        } else {
          console.log(`❌ [TYPING] Missing userId or chatId:`, { userId, chatId });
        }
      });

      socket.on("stopTyping", ({ chatId, userId }) => {
        if (userId && chatId) {
          console.log(`🔴 [STOP TYPING] User ${userId} stopped typing in chat ${chatId}`);

          // Xóa trạng thái typing nếu tồn tại
          if (typingUsers[chatId] && typingUsers[chatId][userId]) {
            delete typingUsers[chatId][userId];
          }

          // Broadcast stop typing event to the chat room with chatId
          socket.to(chatId).emit("userStopTyping", { userId, chatId });
          console.log(`📤 [STOP TYPING] Emitted userStopTyping to room ${chatId} for user ${userId}`);

          // Reset timeout khi có hoạt động
          setUserInactiveTimeout(userId);
        } else {
          console.log(`❌ [STOP TYPING] Missing userId or chatId:`, { userId, chatId });
        }
      });

      // Thông báo trạng thái online
      socket.on("userOnline", async ({ userId, chatId }) => {
        if (userId) {
          console.log(`User ${userId} is online in chat ${chatId}`);

          // Lưu vào Redis và publish event
          socket.data.userId = userId;
          await redisService.setUserOnlineStatus(userId, true, Date.now());
          await redisService.setUserSocketId(userId, socket.id);
          await pubClient.publish('user:online', JSON.stringify({ userId }));

          // Reset timeout khi có hoạt động
          setUserInactiveTimeout(userId);

          // Broadcast event toàn cầu ngay lập tức
          io.emit("userOnline", { userId });

          // Nếu là chat cụ thể, thông báo user online trong chat đó
          if (chatId && chatId !== 'global') {
            socket.to(chatId).emit("userStatus", { userId, status: "online" });
          }

          // Gửi lại trạng thái online cho chính user đó để confirm
          socket.emit("userStatus", { userId, status: "online" });
        }
      });

      // Xử lý thông báo tin nhắn đã đọc
      socket.on("messageRead", async (data) => {
        console.log(`User ${data.userId} đã đọc tin nhắn trong chat ${data.chatId}`);

        // Đảm bảo có đủ thông tin cần thiết
        if (!data.userId || !data.chatId) {
          return;
        }

        // Thông báo tới tất cả người dùng trong phòng chat ngay lập tức
        socket.to(data.chatId).emit("messageRead", {
          userId: data.userId,
          chatId: data.chatId,
          timestamp: data.timestamp || new Date().toISOString()
        });

        // Cũng emit cho chính user để confirm
        socket.emit("messageRead", {
          userId: data.userId,
          chatId: data.chatId,
          timestamp: data.timestamp || new Date().toISOString()
        });

        // Reset timeout khi có hoạt động
        if (socket.data.userId) {
          setUserInactiveTimeout(socket.data.userId);
        }
      });

      // Rời phòng chat
      socket.on("leaveChat", (chatId) => {
        socket.leave(chatId);

        // Reset timeout khi có hoạt động
        if (socket.data.userId) {
          setUserInactiveTimeout(socket.data.userId);
        }
      });

      // ====================== GROUP CHAT SOCKET EVENTS ======================
      
      // Group chat events đã được chuyển sang socketGroupChat.js
      // File này chỉ xử lý chat 1-1

      // ====================== END GROUP CHAT EVENTS ======================

      // Xử lý khi ngắt kết nối
      socket.on("disconnecting", async () => {
        const uid = socket.data.userId;
        console.log(`🔌 [DISCONNECT][${socket.id}] User disconnecting:`, {
          userId: uid,
          hasUserId: !!uid,
          rooms: Array.from(socket.rooms)
        });
        
        if (uid) {
          console.log(`✅ [DISCONNECT][${socket.id}] Processing disconnect for user:`, uid);
          await redisService.setUserOnlineStatus(uid, false, Date.now());
          await redisService.deleteUserSocketId(uid);
          await pubClient.publish('user:offline', JSON.stringify({ userId: uid, lastSeen: Date.now() }));
          console.info(`[Socket][${socket.id}] User offline: ${uid}`);
          io.emit("userOffline", { userId: uid });
          io.emit("userLastSeen", { userId: uid, lastSeen: new Date().toISOString() });

          // Xóa timeout khi disconnect
          if (userActivityTimeouts[uid]) {
            clearTimeout(userActivityTimeouts[uid]);
            delete userActivityTimeouts[uid];
          }

          // Xóa tất cả trạng thái typing và thông báo cho tất cả các chat liên quan
          Object.keys(typingUsers).forEach(chatId => {
            if (typingUsers[chatId] && typingUsers[chatId][uid]) {
              delete typingUsers[chatId][uid];
              io.to(chatId).emit("userStopTyping", { userId: uid, chatId });
            }
          });

          socket.rooms.forEach((room) => {
            if (room !== socket.id) {
              socket.to(room).emit("userStatus", { userId: uid, status: "offline" });
            }
          });
        } else {
          console.log(`❌ [DISCONNECT][${socket.id}] No userId found during disconnect`);
        }
      });
    });

    // Lắng nghe Pub/Sub để đồng bộ trạng thái online giữa các instance
    try {
      await subClient.subscribe('user:online', (message) => {
        try {
          const { userId } = JSON.parse(message);
          console.info(`[PubSub] User online: ${userId}`);
          io.emit("userOnline", { userId });
        } catch (err) {
          console.error(`Error processing user:online message: ${err.message}`);
        }
      });

      await subClient.subscribe('user:offline', (message) => {
        try {
          const { userId, lastSeen } = JSON.parse(message);
          console.info(`[PubSub] User offline: ${userId}`);
          io.emit("userOffline", { userId });
          io.emit("userLastSeen", { userId, lastSeen });
        } catch (err) {
          console.error(`Error processing user:offline message: ${err.message}`);
        }
      });
    } catch (err) {
      console.error(`Error setting up Redis subscriptions: ${err.message}`);
      throw err; // Re-throw để xử lý ở cấp cao hơn
    }

    // Cleanup khi đóng kết nối
    process.on('SIGTERM', async () => {
      console.info('Cleaning up Redis connections...');
      try {
        await subClient.unsubscribe();
        await pubClient.quit();
        await subClient.quit();
      } catch (err) {
        console.error(`Error during Redis cleanup: ${err.message}`);
      }
    });

    // Hàm public để lấy danh sách user online
    io.getOnlineUsers = async () => {
      return await redisService.getAllOnlineUsers();
    };

    io.getLastSeen = async (userId) => {
      const status = await redisService.getUserOnlineStatus(userId);
      return status?.lastSeen || null;
    };

    // Dọn dẹp timeout hết hạn mỗi phút
    setInterval(() => {
      // Không cần thực hiện gì vì đã dựa vào client-side timeout
    }, 60000);

    // Đảm bảo các socket không hoạt động sẽ bị đánh dấu là offline
    setInterval(async () => {
      const onlineUsers = await redisService.getAllOnlineUsers();
      for (const userId of onlineUsers) {
        const socketId = await redisService.getUserSocketId(userId);
        const socket = io.sockets.sockets.get(socketId);

        // Nếu socket không tồn tại hoặc không connected
        if (!socket || !socket.connected) {
          console.log(`Found disconnected socket for user ${userId}, marking as offline`);

          // Xóa timeout nếu có
          if (userActivityTimeouts[userId]) {
            clearTimeout(userActivityTimeouts[userId]);
            delete userActivityTimeouts[userId];
          }

          // Đánh dấu user offline
          await redisService.setUserOnlineStatus(userId, false, Date.now());
          await redisService.deleteUserSocketId(userId);
          await pubClient.publish('user:offline', JSON.stringify({ userId, lastSeen: Date.now() }));

          // Thông báo cho tất cả client
          io.emit("userOffline", { userId });
          io.emit("userLastSeen", { userId, lastSeen: new Date().toISOString() });
        }
      }
    }, 120000); // Kiểm tra mỗi 2 phút

  } catch (err) {
    console.error(`Error initializing socket server: ${err.message}`);
    throw err;
  }
}; 