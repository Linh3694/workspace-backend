const Ticket = require("./models/Ticket");
const jwt = require("jsonwebtoken");

// Socket.IO events cho ticket chat
module.exports = (io) => {
  const processedTempIds = new Set();

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    // Join room by userId (for personal events)
    try {
      const token = socket.handshake.query.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded._id) {
          socket.join(decoded._id.toString());
          socket.data.userId = decoded._id.toString();
        }
      }
    } catch (err) {
      console.error('Token verify error:', err);
    }

    socket.on("joinTicket", (ticketId) => {
      socket.join(ticketId);
      console.log(`Socket ${socket.id} joined ticket room ${ticketId}`);
    });

    // Client‑side explicit join to personal room (fallback)
    socket.on("joinUserRoom", (uid) => {
      if (uid) {
        socket.join(uid.toString());
      }
    });

    socket.on("typing", ({ ticketId, isTyping, userId }) => {
      socket.to(ticketId).emit("userTyping", { userId, isTyping });
    });

    socket.on("userOnline", ({ userId, ticketId }) => {
      socket.to(ticketId).emit("userStatus", { userId, status: "online" });
      socket.data.userId = userId;           // remember for disconnect
    });

    socket.on("leaveTicket", (ticketId) => {
      socket.leave(ticketId);
    });

    socket.on("messageReceived", (data) => {
      // Broadcast chỉ tới các client khác, không phải người gửi
      socket.to(data.ticketId).emit("messageReceived", data);
    });

    socket.on("messageSeen", (data) => {
      // Broadcast chỉ tới các client khác, không phải người gửi
      socket.to(data.ticketId).emit("messageSeen", data);
    });

    socket.on("sendMessage", async (data) => {
      try {
        if (data.tempId && processedTempIds.has(data.tempId)) return;
        if (data.tempId) processedTempIds.add(data.tempId);
        // Save to DB
        const ticketDoc = await Ticket.findById(data.ticketId).populate("creator assignedTo");
        if (!ticketDoc) return;

        ticketDoc.messages.push({
          text: data.text,
          sender: data.sender._id,
          type: data.type || "text",
          timestamp: new Date(),
        });

        await ticketDoc.save();
        // Re‑load just‑saved message with populated sender
        const populated = await Ticket.findById(ticketDoc._id)
          .select({ messages: { $slice: -1 } })   // only last message
          .populate("messages.sender", "fullname avatarUrl email");

        const msg = populated.messages[0];

        // Broadcast with real _id - chỉ emit tới người gửi
        if (data.tempId) {
          socket.emit("receiveMessage", {
            _id: msg._id,
            text: msg.text,
            sender: msg.sender,
            timestamp: msg.timestamp,
            type: msg.type,
            tempId: data.tempId,
          });
        }

        // Broadcast tới tất cả các client khác trong phòng (không bao gồm người gửi)
        socket.to(data.ticketId).emit("receiveMessage", {
          _id: msg._id,
          text: msg.text,
          sender: msg.sender,
          timestamp: msg.timestamp,
          type: msg.type,
        });
      } catch (err) {
        console.error("Error storing message:", err);
      }
    });

    socket.on("disconnecting", () => {
      const uid = socket.data.userId;
      if (uid) {
        socket.rooms.forEach((room) => {
          if (room !== socket.id) {
            socket.to(room).emit("userStatus", { userId: uid, status: "offline" });
          }
        });
      }
    });
  });
}; 