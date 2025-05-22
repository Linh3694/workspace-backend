const jwt = require("jsonwebtoken");

// Lưu trạng thái online của user và thời gian last seen
const onlineUsers = {};
const lastSeenUsers = {};
// Tracking typing status
const typingUsers = {};
// Thêm timeout để tự động đánh dấu người dùng offline sau một thời gian không hoạt động
const userActivityTimeouts = {};
const USER_OFFLINE_TIMEOUT = 60 * 1000; // 60 giây không hoạt động sẽ tự động offline

module.exports = function (io) {
  // Hàm để đánh dấu người dùng offline sau một khoảng thời gian
  const setUserInactiveTimeout = (userId) => {
    // Xóa timeout cũ nếu có
    if (userActivityTimeouts[userId]) {
      clearTimeout(userActivityTimeouts[userId]);
    }

    // Thiết lập timeout mới
    userActivityTimeouts[userId] = setTimeout(() => {
      if (onlineUsers[userId]) {
        console.log(`Auto marking user ${userId} as offline due to inactivity`);

        // Lưu thời gian last seen khi tự động offline
        lastSeenUsers[userId] = new Date().toISOString();

        // Xóa khỏi danh sách online
        delete onlineUsers[userId];

        // Thông báo cho tất cả client
        io.emit("userOffline", { userId });
        io.emit("userLastSeen", { userId, lastSeen: lastSeenUsers[userId] });

        // Xóa timeout
        delete userActivityTimeouts[userId];
      }
    }, USER_OFFLINE_TIMEOUT);
  };

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    let currentUserId = null;
    // Join room by userId (for personal events)
    try {
      const token = socket.handshake.query.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded._id) {
          currentUserId = decoded._id.toString();
          socket.join(currentUserId);
          socket.data.userId = currentUserId;

          // Đánh dấu người dùng online
          onlineUsers[currentUserId] = socket.id;

          // Thiết lập timeout cho người dùng
          setUserInactiveTimeout(currentUserId);

          // Thông báo tới tất cả client user này online
          io.emit("userOnline", { userId: currentUserId });
        }
      }
    } catch (err) {
      console.error('Token verify error:', err);
    }

    // Join vào phòng chat
    socket.on("joinChat", (chatId) => {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat room ${chatId}`);

      // Reset timeout khi có hoạt động
      if (socket.data.userId) {
        setUserInactiveTimeout(socket.data.userId);
      }
    });

    // Client‑side explicit join to personal room (fallback)
    socket.on("joinUserRoom", (uid) => {
      if (uid) {
        socket.join(uid.toString());

        // Reset timeout khi có hoạt động
        setUserInactiveTimeout(uid);
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
    socket.on("ping", ({ userId }) => {
      if (userId) {
        // Refresh thời gian online và socket id
        onlineUsers[userId] = socket.id;

        // Reset timeout khi có ping
        setUserInactiveTimeout(userId);
      }
    });

    // Xử lý khi app vào background
    socket.on("userBackground", ({ userId }) => {
      if (userId) {
        console.log(`User ${userId} went to background`);
        // Không xóa khỏi onlineUsers ngay, chỉ ghi nhận thời gian
        lastSeenUsers[userId] = new Date().toISOString();

        // Rút ngắn thời gian timeout khi ở background (15 giây)
        if (userActivityTimeouts[userId]) {
          clearTimeout(userActivityTimeouts[userId]);
        }

        userActivityTimeouts[userId] = setTimeout(() => {
          if (onlineUsers[userId]) {
            console.log(`Marking user ${userId} as offline from background`);
            delete onlineUsers[userId];
            io.emit("userOffline", { userId });
            io.emit("userLastSeen", { userId, lastSeen: lastSeenUsers[userId] });
            delete userActivityTimeouts[userId];
          }
        }, 15000); // Chỉ 15 giây khi ở background
      }
    });

    // Kiểm tra trạng thái online của người dùng
    socket.on("checkUserStatus", ({ userId }) => {
      console.log(`Checking status for user ${userId}`);
      const isOnline = !!onlineUsers[userId];
      socket.emit("userStatus", {
        userId,
        status: isOnline ? "online" : "offline"
      });

      // Nếu offline, gửi thêm thời gian last seen
      if (!isOnline && lastSeenUsers[userId]) {
        socket.emit("userLastSeen", {
          userId,
          lastSeen: lastSeenUsers[userId]
        });
      }

      // Reset timeout khi có hoạt động
      if (socket.data.userId) {
        setUserInactiveTimeout(socket.data.userId);
      }
    });

    // Trả về danh sách người dùng đang online
    socket.on("getUsersOnlineStatus", () => {
      socket.emit("onlineUsers", Object.keys(onlineUsers));

      // Cũng trả về last seen cho các user offline
      Object.keys(lastSeenUsers).forEach(userId => {
        if (!onlineUsers[userId]) {
          socket.emit("userLastSeen", {
            userId,
            lastSeen: lastSeenUsers[userId]
          });
        }
      });

      // Reset timeout khi có hoạt động
      if (socket.data.userId) {
        setUserInactiveTimeout(socket.data.userId);
      }
    });

    // Typing indicator
    socket.on("typing", ({ chatId, userId }) => {
      if (userId && chatId) {
        console.log(`User ${userId} is typing in chat ${chatId}`);

        // Set trạng thái typing và timeout
        if (!typingUsers[chatId]) {
          typingUsers[chatId] = {};
        }

        // Lưu trạng thái typing
        typingUsers[chatId][userId] = true;

        // Broadcast typing event to the chat room
        socket.to(chatId).emit("userTyping", { userId });

        // Reset timeout khi có hoạt động
        setUserInactiveTimeout(userId);
      }
    });

    socket.on("stopTyping", ({ chatId, userId }) => {
      if (userId && chatId) {
        console.log(`User ${userId} stopped typing in chat ${chatId}`);

        // Xóa trạng thái typing nếu tồn tại
        if (typingUsers[chatId] && typingUsers[chatId][userId]) {
          delete typingUsers[chatId][userId];
        }

        // Broadcast stop typing event to the chat room
        socket.to(chatId).emit("userStopTyping", { userId });

        // Reset timeout khi có hoạt động
        setUserInactiveTimeout(userId);
      }
    });

    // Thông báo trạng thái online
    socket.on("userOnline", ({ userId, chatId }) => {
      if (userId) {
        console.log(`User ${userId} is online in chat ${chatId}`);

        // Lưu vào onlineUsers global
        socket.data.userId = userId;
        onlineUsers[userId] = socket.id;

        // Reset timeout khi có hoạt động
        setUserInactiveTimeout(userId);

        // Nếu là chat cụ thể, thông báo user online trong chat đó
        if (chatId && chatId !== 'global') {
          socket.to(chatId).emit("userStatus", { userId, status: "online" });
        }

        // Broadcast event toàn cầu
        io.emit("userOnline", { userId });
      }
    });

    // Xử lý thông báo tin nhắn đã đọc
    socket.on("messageRead", (data) => {
      console.log(`User ${data.userId} đã đọc tin nhắn trong chat ${data.chatId}`);

      // Đảm bảo có đủ thông tin cần thiết
      if (!data.userId || !data.chatId) {
        return;
      }

      // Thông báo tới tất cả người dùng trong phòng chat
      socket.to(data.chatId).emit("messageRead", {
        userId: data.userId,
        chatId: data.chatId,
        timestamp: new Date().toISOString()  // Thêm timestamp để client có thể sắp xếp
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

    // Xử lý khi ngắt kết nối
    socket.on("disconnecting", () => {
      const uid = socket.data.userId;
      if (uid) {
        // Xóa timeout khi disconnect
        if (userActivityTimeouts[uid]) {
          clearTimeout(userActivityTimeouts[uid]);
          delete userActivityTimeouts[uid];
        }

        // Remove từ onlineUsers
        delete onlineUsers[uid];

        // Lưu thời gian last seen
        lastSeenUsers[uid] = new Date().toISOString();

        // Xóa tất cả trạng thái typing và thông báo cho tất cả các chat liên quan
        Object.keys(typingUsers).forEach(chatId => {
          if (typingUsers[chatId] && typingUsers[chatId][uid]) {
            delete typingUsers[chatId][uid];
            io.to(chatId).emit("userStopTyping", { userId: uid });
          }
        });

        // Thông báo tới tất cả client user này offline
        io.emit("userOffline", { userId: uid });
        io.emit("userLastSeen", { userId: uid, lastSeen: lastSeenUsers[uid] });

        socket.rooms.forEach((room) => {
          if (room !== socket.id) {
            socket.to(room).emit("userStatus", { userId: uid, status: "offline" });
          }
        });
      }
    });
  });

  // Hàm public để lấy danh sách user online (nếu cần)
  io.getOnlineUsers = () => Object.keys(onlineUsers);
  io.getLastSeen = (userId) => lastSeenUsers[userId] || null;

  // Dọn dẹp timeout hết hạn mỗi phút
  setInterval(() => {
    // Không cần thực hiện gì vì đã dựa vào client-side timeout
  }, 60000);

  // Đảm bảo các socket không hoạt động sẽ bị đánh dấu là offline
  setInterval(() => {
    Object.keys(onlineUsers).forEach(userId => {
      const socketId = onlineUsers[userId];
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
        delete onlineUsers[userId];
        lastSeenUsers[userId] = new Date().toISOString();

        // Thông báo cho tất cả client
        io.emit("userOffline", { userId });
        io.emit("userLastSeen", { userId, lastSeen: lastSeenUsers[userId] });
      }
    });
  }, 120000); // Kiểm tra mỗi 2 phút
}; 