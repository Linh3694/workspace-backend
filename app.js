// app.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const cors = require("cors");
const passport = require("passport");
const session = require("express-session");
const Ticket = require("./models/Ticket");
const { connectRedis } = require('./config/redis');
require("dotenv").config();

// Import các route
const authRoutes = require("./routes/Auth/auth");
const authMicrosoftRoutes = require("./routes/Auth/authMicrosoft");
const laptopRoutes = require("./routes/Inventory/laptops");
const monitorRoutes = require("./routes/Inventory/monitors");
const printerRoutes = require("./routes/Inventory/printers");
const projectorRoutes = require("./routes/Inventory/projectors");
const toolRoutes = require("./routes/Inventory/tool");
const roomRoutes = require("./routes/Management/room");
const userRoutes = require("./routes/Management/users");
const activityRoutes = require('./routes/Inventory/activityRoutes');
const ticketRoutes = require("./routes/Ticket/tickets");
const inspectRoutes = require("./routes/Inventory/inspect");
const studentRoutes = require("./routes/SIS/students");
const documentRoutes = require("./routes/Management/documents");
const pdfRoutes = require("./routes/Flippage/pdf");
const jobRoutes = require("./routes/Recruitment/jobRoutes");
const applicationRoutes = require("./routes/Recruitment/applicationRoutes");
const schoolYearRoutes = require("./routes/SIS/schoolYearRoutes");
const classRoutes = require("./routes/SIS/classRoutes");
const enrollmentRoutes = require("./routes/SIS/studentClassEnrollmentRoutes");
const photoRoutes = require("./routes/SIS/photoRoutes");
const awardRecordRoutes = require("./routes/HallOfHonor/awardRecordRoutes");
const awardCategoryRoutes = require("./routes/HallOfHonor/awardCategoryRoutes");
const routeRoutes = require("./routes/Bus/routeRoutes");
const vehicleRoutes = require("./routes/Bus/vehicleRoutes");
const tripRoutes = require("./routes/Bus/tripRoutes");
const dailyTripRoutes = require("./routes/Bus/dailyTripRoutes");
const libraryRoutes = require("./routes/Library/library");
const admissionRoutes = require("./routes/Admission/admissionRoutes");
const chatRoutes = require("./routes/Chat/chatRoutes");
const chatSocket = require('./socketChat');
const socketTicketChat = require('./socketTicketChat');
const notificationRoutes = require("./routes/Notification/notificationRoutes");
const emojiRoutes = require('./routes/Chat/emojiRoutes');

const app = express();
// Tạo HTTP server và tích hợp Socket.IO
const http = require('http');
const { Server } = require('socket.io');
const jwt = require("jsonwebtoken"); // ADD THIS import just above
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  allowRequest: (req, callback) => {
    const token = req._query.token;
    if (!token) return callback("unauthorized", false);
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return callback("unauthorized", false);
      req.user = decoded;           // attach for later use
      callback(null, true);
    });
  },
});

app.set("io", io); // expose socket.io instance to controllers

// Khởi tạo các socket handlers
socketTicketChat(io);
chatSocket(io);

// Kết nối MongoDB và Redis
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    // await connectRedis();
  } catch (error) {
    process.exit(1);
  }
};
connectDB();

// Đảm bảo thư mục uploads tồn tại
const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: "4096mb" }));
app.use(express.urlencoded({ limit: "4096mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadPath));

// Cấu hình session và passport
app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 1 ngày
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Định tuyến
app.use("/api/auth", authRoutes);
app.use("/api/auth", authMicrosoftRoutes);
app.use("/api/laptops", laptopRoutes);
app.use("/api/monitors", monitorRoutes);
app.use("/api/printers", printerRoutes);
app.use("/api/projectors", projectorRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tools", toolRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/inspects", inspectRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/flippage", pdfRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/schoolyears", schoolYearRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/award-records", awardRecordRoutes);
app.use("/api/award-categories", awardCategoryRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/daily-trips", dailyTripRoutes);
app.use("/api/libraries", libraryRoutes);
app.use("/api/email", require("./routes/Ticket/emailRoutes"));
app.use("/api/admission", admissionRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/emoji", emojiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Khởi động server
const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

require("./cronEmail");

module.exports = app;