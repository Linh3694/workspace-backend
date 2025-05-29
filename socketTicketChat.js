const Ticket = require("./models/Ticket");
const jwt = require("jsonwebtoken");

// Socket.IO events cho ticket chat với tối ưu hiệu năng
module.exports = (io) => {
  // Tối ưu: Sử dụng LRU Cache với size limit
  class LRUCache {
    constructor(maxSize = 1000) {
      this.maxSize = maxSize;
      this.cache = new Map();
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    has(key) {
      return this.cache.has(key);
    }

    delete(key) {
      return this.cache.delete(key);
    }

    cleanup() {
      const now = Date.now();
      const expiredKeys = [];
      
      for (const [key, timestamp] of this.cache.entries()) {
        if (now - timestamp > 5 * 60 * 1000) { // 5 minutes
          expiredKeys.push(key);
        }
      }
      
      expiredKeys.forEach(key => this.cache.delete(key));
      return expiredKeys.length;
    }
  }

  const processedTempIds = new LRUCache(2000); // Max 2000 temp IDs
  const userSockets = new Map();
  const typingUsers = new Map();

  // Tối ưu cleanup: chạy mỗi 30s và có batch cleanup
  const cleanupInterval = setInterval(() => {
    const cleanedCount = processedTempIds.cleanup();
    
    // Cleanup typing users expired
    const now = Date.now();
    let expiredTyping = 0;
    for (const [key, timeout] of typingUsers.entries()) {
      if (timeout && timeout._idleStart && (now - timeout._idleStart > 10000)) {
        clearTimeout(timeout);
        typingUsers.delete(key);
        expiredTyping++;
      }
    }
    
    if (cleanedCount > 0 || expiredTyping > 0) {
      console.log(`🧹 Cleanup: ${cleanedCount} tempIds, ${expiredTyping} typing indicators`);
    }
  }, 30000); // Check every 30 seconds

  // Cleanup on module unload
  process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
  });

  io.on("connection", (socket) => {
    console.log("🔗 Socket connected:", socket.id);
    let currentUserId = null;
    let currentTicketRooms = new Set();

    // Enhanced authentication with error handling
    try {
      const token = socket.handshake.query.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded._id) {
          currentUserId = decoded._id.toString();
          socket.join(currentUserId);
          socket.data.userId = currentUserId;

          // Track user socket
          if (!userSockets.has(currentUserId)) {
            userSockets.set(currentUserId, new Set());
          }
          userSockets.get(currentUserId).add(socket.id);

          console.log(`👤 User ${currentUserId} authenticated with socket ${socket.id}`);
        }
      }
    } catch (err) {
      console.error('🔐 Token verify error:', err.message);
      socket.emit('authError', { message: 'Token không hợp lệ' });
      return;
    }

    // Join ticket room với validation
    socket.on("joinTicketRoom", async (ticketId) => {
      try {
        if (!currentUserId) {
          socket.emit('error', { message: 'Chưa xác thực' });
          return;
        }

        // Validate ticket exists và user có quyền truy cập
        const ticket = await Ticket.findById(ticketId)
          .populate('creator assignedTo')
          .select('creator assignedTo');

        if (!ticket) {
          socket.emit('error', { message: 'Ticket không tồn tại' });
          return;
        }

        // Check permission
        const hasPermission = ticket.creator._id.toString() === currentUserId ||
          (ticket.assignedTo && ticket.assignedTo._id.toString() === currentUserId);

        if (!hasPermission) {
          socket.emit('error', { message: 'Không có quyền truy cập ticket này' });
          return;
        }

        socket.join(ticketId);
        currentTicketRooms.add(ticketId);
        console.log(`🎫 Socket ${socket.id} joined ticket room ${ticketId}`);

        // Thông báo user online trong ticket
        socket.to(ticketId).emit("userOnline", {
          userId: currentUserId,
          ticketId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Error joining ticket room:', error);
        socket.emit('error', { message: 'Lỗi khi tham gia phòng chat' });
      }
    });

    // Enhanced typing indicator với debouncing
    socket.on("typing", ({ ticketId, isTyping }) => {
      if (!currentUserId || !currentTicketRooms.has(ticketId)) return;

      const typingKey = `${ticketId}-${currentUserId}`;

      if (isTyping) {
        if (!typingUsers.has(typingKey)) {
          typingUsers.set(typingKey, setTimeout(() => {
            typingUsers.delete(typingKey);
            socket.to(ticketId).emit("userStopTyping", {
              userId: currentUserId,
              ticketId
            });
          }, 5000)); // Auto stop after 5s

          socket.to(ticketId).emit("userTyping", {
            userId: currentUserId,
            ticketId
          });
        }
      } else {
        if (typingUsers.has(typingKey)) {
          clearTimeout(typingUsers.get(typingKey));
          typingUsers.delete(typingKey);
          socket.to(ticketId).emit("userStopTyping", {
            userId: currentUserId,
            ticketId
          });
        }
      }
    });

    // User online status với heartbeat
    socket.on("userOnline", ({ ticketId }) => {
      if (!currentUserId || !currentTicketRooms.has(ticketId)) return;

      socket.to(ticketId).emit("userStatus", {
        userId: currentUserId,
        status: "online",
        timestamp: new Date().toISOString()
      });
    });

    // Leave ticket room
    socket.on("leaveTicket", (ticketId) => {
      if (currentTicketRooms.has(ticketId)) {
        socket.leave(ticketId);
        currentTicketRooms.delete(ticketId);

        // Clear typing if any
        const typingKey = `${ticketId}-${currentUserId}`;
        if (typingUsers.has(typingKey)) {
          clearTimeout(typingUsers.get(typingKey));
          typingUsers.delete(typingKey);
        }

        console.log(`🚪 Socket ${socket.id} left ticket room ${ticketId}`);
      }
    });

    // Enhanced message delivery confirmation
    socket.on("messageReceived", (data) => {
      if (!currentUserId || !data.ticketId) return;
      socket.to(data.ticketId).emit("messageReceived", {
        ...data,
        receivedBy: currentUserId,
        timestamp: new Date().toISOString()
      });
    });

    // Message seen confirmation
    socket.on("messageSeen", (data) => {
      if (!currentUserId || !data.ticketId) return;
      socket.to(data.ticketId).emit("messageSeen", {
        ...data,
        seenBy: currentUserId,
        timestamp: new Date().toISOString()
      });
    });

    // Enhanced send message với duplicate prevention
    socket.on("sendMessage", async (data) => {
      try {
        if (!currentUserId) {
          socket.emit('error', { message: 'Chưa xác thực' });
          return;
        }

        // Check if already processed
        if (data.tempId && processedTempIds.has(data.tempId)) {
          console.log(`⚠️  Duplicate message detected: ${data.tempId}`);
          return;
        }

        if (data.tempId) {
          processedTempIds.set(data.tempId, Date.now());
        }

        // Validate input
        if (!data.ticketId || !data.text?.trim()) {
          socket.emit('error', { message: 'Dữ liệu tin nhắn không hợp lệ' });
          return;
        }

        // Enhanced rate limiting với sliding window
        class RateLimiter {
          constructor() {
            this.userRequests = new Map();
          }

          checkLimit(userId, userRole = 'user') {
            const now = Date.now();
            const windowMs = 60000; // 1 minute
            
            // Different limits for different roles
            const limits = {
              'superadmin': 50,
              'admin': 30, 
              'technical': 20,
              'user': 10
            };
            
            const limit = limits[userRole] || limits['user'];
            
            if (!this.userRequests.has(userId)) {
              this.userRequests.set(userId, []);
            }
            
            const requests = this.userRequests.get(userId);
            
            // Remove old requests (sliding window)
            const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
            this.userRequests.set(userId, validRequests);
            
            // Check if under limit
            if (validRequests.length >= limit) {
              return { allowed: false, resetTime: Math.min(...validRequests) + windowMs };
            }
            
            // Add current request
            validRequests.push(now);
            return { allowed: true, remaining: limit - validRequests.length };
          }

          cleanup() {
            const now = Date.now();
            let cleanedUsers = 0;
            
            for (const [userId, requests] of this.userRequests.entries()) {
              const validRequests = requests.filter(timestamp => now - timestamp < 60000);
              if (validRequests.length === 0) {
                this.userRequests.delete(userId);
                cleanedUsers++;
              } else {
                this.userRequests.set(userId, validRequests);
              }
            }
            
            return cleanedUsers;
          }
        }

        const rateLimiter = new RateLimiter();

        // Rate limiting: max messages per minute based on user role
        const rateCheck = rateLimiter.checkLimit(currentUserId, socket.data.userRole);
        
        if (!rateCheck.allowed) {
          const waitTime = Math.ceil((rateCheck.resetTime - Date.now()) / 1000);
          socket.emit('error', { 
            message: `Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ ${waitTime}s.`,
            type: 'rate_limit',
            resetTime: rateCheck.resetTime
          });
          return;
        }

        // Validate ticket permission
        const ticketDoc = await Ticket.findById(data.ticketId).populate("creator assignedTo");
        if (!ticketDoc) {
          socket.emit('error', { message: 'Ticket không tồn tại' });
          return;
        }

        const hasPermission = ticketDoc.creator._id.toString() === currentUserId ||
          (ticketDoc.assignedTo && ticketDoc.assignedTo._id.toString() === currentUserId);

        if (!hasPermission) {
          socket.emit('error', { message: 'Không có quyền gửi tin nhắn trong ticket này' });
          return;
        }

        // Save message to database
        const messageData = {
          text: data.text.trim(),
          sender: currentUserId,
          type: data.type || "text",
          timestamp: new Date(),
        };

        ticketDoc.messages.push(messageData);
        await ticketDoc.save();

        // Get the saved message with populated sender
        const populated = await Ticket.findById(ticketDoc._id)
          .select({ messages: { $slice: -1 } })
          .populate("messages.sender", "fullname avatarUrl email");

        const savedMessage = populated.messages[0];

        // Broadcast message với enhanced data
        const messageToSend = {
          _id: savedMessage._id,
          text: savedMessage.text,
          sender: savedMessage.sender,
          timestamp: savedMessage.timestamp,
          type: savedMessage.type,
          ticketId: data.ticketId
        };

        console.log(`📡 Broadcasting message to ticket room ${data.ticketId}:`, {
          messageId: messageToSend._id,
          sender: messageToSend.sender.fullname,
          roomMembers: io.sockets.adapter.rooms.get(data.ticketId)?.size || 0
        });

        // ✅ QUAN TRỌNG: Broadcast tới TẤT CẢ users trong room (bao gồm cả sender)
        // Để đảm bảo sender cũng nhận được message với _id từ database
        io.to(data.ticketId).emit("newMessage", messageToSend);

        // Optional: Send confirmation to sender with tempId if needed
        if (data.tempId) {
          socket.emit("messageConfirmed", {
            tempId: data.tempId,
            realMessageId: savedMessage._id,
            timestamp: savedMessage.timestamp
          });
        }

        console.log(`📨 Message broadcast completed for ticket ${data.ticketId} by user ${currentUserId}`);

      } catch (err) {
        console.error("❌ Error storing message:", err);
        socket.emit('error', { message: 'Lỗi khi lưu tin nhắn' });
      }
    });

    // Ping/pong để maintain connection
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date().toISOString() });
    });

    // Connection error handling
    socket.on('error', (error) => {
      console.error(`🔥 Socket error for ${socket.id}:`, error);
    });

    // Enhanced disconnect handling
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Socket ${socket.id} disconnected:`, reason);

      if (currentUserId) {
        // Remove from user sockets tracking
        if (userSockets.has(currentUserId)) {
          userSockets.get(currentUserId).delete(socket.id);
          if (userSockets.get(currentUserId).size === 0) {
            userSockets.delete(currentUserId);
          }
        }

        // Notify all ticket rooms user went offline
        currentTicketRooms.forEach(ticketId => {
          socket.to(ticketId).emit("userStatus", {
            userId: currentUserId,
            status: "offline",
            timestamp: new Date().toISOString()
          });
        });

        // Clear all typing indicators for this user
        for (const [typingKey, timeout] of typingUsers.entries()) {
          if (typingKey.endsWith(`-${currentUserId}`)) {
            clearTimeout(timeout);
            typingUsers.delete(typingKey);
          }
        }
      }
    });

    // Cleanup on disconnecting
    socket.on("disconnecting", () => {
      if (currentUserId) {
        socket.rooms.forEach((room) => {
          if (room !== socket.id && currentTicketRooms.has(room)) {
            socket.to(room).emit("userStatus", {
              userId: currentUserId,
              status: "offline",
              timestamp: new Date().toISOString()
            });
          }
        });
      }
    });
  });

  // Utility function để broadcast tới tất cả sockets của user
  const broadcastToUser = (userId, event, data) => {
    if (userSockets.has(userId)) {
      userSockets.get(userId).forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit(event, data);
        }
      });
    }
  };

  // Export utility functions
  return {
    broadcastToUser,
    getOnlineUsers: () => Array.from(userSockets.keys()),
    getTypingUsers: (ticketId) => {
      const typing = [];
      for (const [key] of typingUsers.entries()) {
        if (key.startsWith(`${ticketId}-`)) {
          typing.push(key.split('-')[1]);
        }
      }
      return typing;
    }
  };
}; 