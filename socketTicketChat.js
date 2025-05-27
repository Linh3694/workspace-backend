const Ticket = require("./models/Ticket");
const jwt = require("jsonwebtoken");

// Socket.IO events cho ticket chat với tối ưu hiệu năng
module.exports = (io) => {
  const processedTempIds = new Map(); // Sử dụng Map thay vì Set để có TTL
  const userSockets = new Map(); // Track user sockets
  const typingUsers = new Map(); // Track typing users per ticket

  // Cleanup processed temp IDs sau 5 phút
  setInterval(() => {
    const now = Date.now();
    for (const [tempId, timestamp] of processedTempIds.entries()) {
      if (now - timestamp > 5 * 60 * 1000) { // 5 minutes
        processedTempIds.delete(tempId);
      }
    }
  }, 60000); // Check every minute

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

        // Rate limiting: max 10 messages per minute per user
        const rateLimitKey = `rate_limit_${currentUserId}`;
        if (!socket.data.messageCount) socket.data.messageCount = {};
        if (!socket.data.messageCount[rateLimitKey]) socket.data.messageCount[rateLimitKey] = [];

        const now = Date.now();
        socket.data.messageCount[rateLimitKey] = socket.data.messageCount[rateLimitKey]
          .filter(timestamp => now - timestamp < 60000); // Last minute

        if (socket.data.messageCount[rateLimitKey].length >= 10) {
          socket.emit('error', { message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ một chút.' });
          return;
        }
        socket.data.messageCount[rateLimitKey].push(now);

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

        // Send confirmation to sender with tempId
        if (data.tempId) {
          socket.emit("newMessage", {
            ...messageToSend,
            tempId: data.tempId,
          });
        }

        // Broadcast to other users in the room
        socket.to(data.ticketId).emit("newMessage", messageToSend);

        console.log(`📨 Message sent in ticket ${data.ticketId} by user ${currentUserId}`);

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