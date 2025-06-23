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
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

// Import các route
const authRoutes = require("./routes/Auth/auth");
const authMicrosoftRoutes = require("./routes/Auth/authMicrosoft");
const laptopRoutes = require("./routes/Inventory/laptops");
const monitorRoutes = require("./routes/Inventory/monitors");
const printerRoutes = require("./routes/Inventory/printers");
const projectorRoutes = require("./routes/Inventory/projectors");
const toolRoutes = require("./routes/Inventory/tool");
const userRoutes = require("./routes/Management/users");
const activityRoutes = require('./routes/Inventory/activityRoutes');
const ticketRoutes = require("./routes/Ticket/tickets");
const inspectRoutes = require("./routes/Inventory/inspect");
const studentRoutes = require("./routes/SIS/studentRoutes");
const documentRoutes = require("./routes/Management/documents");
const pdfRoutes = require("./routes/Flippage/pdf");
const jobRoutes = require("./routes/Recruitment/jobRoutes");
const applicationRoutes = require("./routes/Recruitment/applicationRoutes");
const schoolYearRoutes = require("./routes/SIS/schoolYearRoutes");
const educationalSystemRoutes = require("./routes/SIS/educationalSystemRoutes");
const subjectRoutes = require("./routes/SIS/subjectRoutes");
const curriculumRoutes = require("./routes/SIS/curriculumRoutes");
const classRoutes = require("./routes/SIS/classRoutes");
const teacherRoutes = require("./routes/SIS/teacherRoutes");
const schoolRoutes = require("./routes/SIS/schoolRoutes");
const timetableRoutes = require("./routes/SIS/timetableRoutes");
const gradeLevelRoutes = require("./routes/SIS/gradeLevelRoutes");
const roomRoutes = require("./routes/SIS/roomRoutes");
const reportRoutes = require("./routes/SIS/reportRoutes");
const communicationBookRoutes = require("./routes/SIS/communicationBookRoutes");
const familyRoutes = require("./routes/SIS/familyRoutes");
const parentRoutes = require("./routes/SIS/parentRoutes");
const enrollmentRoutes = require("./routes/SIS/enrollmentRoutes");
const photoRoutes = require("./routes/SIS/photoRoutes");
const awardRecordRoutes = require("./routes/HallOfHonor/awardRecordRoutes");
const awardCategoryRoutes = require("./routes/HallOfHonor/awardCategoryRoutes");
const routeRoutes = require("./routes/Bus/routeRoutes");
const vehicleRoutes = require("./routes/Bus/vehicleRoutes");
const tripRoutes = require("./routes/Bus/tripRoutes");
const dailyTripRoutes = require("./routes/Bus/dailyTripRoutes");
const libraryRoutes = require("./routes/Library/library");
const libraryActivityRoutes = require("./routes/Library/libraryActivityRoutes");
const admissionRoutes = require("./routes/SIS/admissionRoutes");
const chatRoutes = require("./routes/Chat/chatRoutes");
const chatSocket = require('./socketChat');
const socketGroupChat = require('./socketGroupChat');
const socketTicketChat = require('./socketTicketChat');
const notificationRoutes = require("./routes/Notification/notificationRoutes");
const emojiRoutes = require('./routes/Chat/emojiRoutes');
const postRoutes = require('./routes/Newfeed/postRoutes');
const timeAttendanceRoutes = require('./routes/timeAttendanceRoutes');
const NewfeedSocket = require('./utils/newfeedSocket');

const app = express();
// Tạo HTTP server và tích hợp Socket.IO
const http = require('http');
const { Server } = require('socket.io');
const jwt = require("jsonwebtoken"); // ADD THIS import just above
const server = http.createServer(app);

// Setup Redis adapter for Socket.IO
const { createAdapter } = require('@socket.io/redis-adapter');

// Redis clients for Socket.IO
const pubClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

const subClient = pubClient.duplicate();

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

// Setup Redis adapter for Socket.IO clustering
(async () => {
  try {
    console.log('🔗 [Main IO] Connecting to Redis for adapter...');
    await pubClient.connect();
    await subClient.connect();
    console.log('✅ [Main IO] Redis connected for adapter');
    
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ [Main IO] Redis adapter setup complete');
  } catch (error) {
    console.warn('⚠️ [Main IO] Redis adapter setup failed:', error.message);
    console.warn('⚠️ [Main IO] Continuing without Redis adapter (single instance)');
  }
})();

// Khởi tạo namespace riêng cho group chat
const groupChatNamespace = io.of('/groupchat');

// Setup authentication middleware cho group chat namespace
groupChatNamespace.use((socket, next) => {
  const token = socket.handshake.query.token;
  console.log(`🔑 [GroupChat Middleware] Token check for socket ${socket.id}`);
  if (!token) {
    console.log(`❌ [GroupChat Middleware] No token provided for socket ${socket.id}`);
    return next(new Error("unauthorized"));
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log(`❌ [GroupChat Middleware] Token verify failed for socket ${socket.id}:`, err.message);
      return next(new Error("unauthorized"));
    }
    
    console.log(`✅ [GroupChat Middleware] Token verified for socket ${socket.id}:`, decoded);
    
    // Set both socket.user and socket.data.userId for compatibility
    socket.user = decoded;
    socket.data = socket.data || {};
    socket.data.userId = (decoded._id || decoded.id).toString();
    
    console.log(`✅ [GroupChat Middleware] Set userId: ${socket.data.userId} for socket ${socket.id}`);
    next();
  });
});

// Khởi tạo các socket handlers
socketTicketChat(io);
chatSocket(io); // Socket cho chat 1-1
socketGroupChat(groupChatNamespace); // Socket riêng cho group chat

// Expose group chat namespace để controllers có thể sử dụng
app.set("groupChatNamespace", groupChatNamespace);

// Initialize newfeed socket
const newfeedSocket = new NewfeedSocket(io);
app.set('newfeedSocket', newfeedSocket);

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

// Đảm bảo các thư mục con tồn tại
const subDirs = ["CV", "Profile", "Avatar", "Chat", "Handovers", "Library", "Activities", "Messages", "Pdf", "posts", "reports", "Tickets"];
subDirs.forEach(dir => {
  const dirPath = path.join(uploadPath, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
});

// Middlewares
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://wis.wellspring.edu.vn',
    'https://api-dev.wellspring.edu.vn'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "4096mb" }));
app.use(express.urlencoded({ limit: "4096mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadPath));

// Create Redis client for sessions
const sessionRedisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

// Connect Redis client for sessions
sessionRedisClient.connect().catch(console.error);

// Cấu hình session và passport
app.use(
  session({
    store: new RedisStore({ 
      client: sessionRedisClient,
      prefix: 'staffportal:sess:'
    }),
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Set to false for development, true for production HTTPS
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'lax' // CSRF protection
    },
    name: 'staffportal.sid' // Custom session name
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
app.use("/api/school-years", schoolYearRoutes);
app.use("/api/educational-systems", educationalSystemRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/curriculums", curriculumRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/timetables", timetableRoutes);
app.use("/api/grade-levels", gradeLevelRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/communications", communicationBookRoutes);
app.use("/api/families", familyRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/award-records", awardRecordRoutes);
app.use("/api/award-categories", awardCategoryRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/daily-trips", dailyTripRoutes);
app.use("/api/libraries", libraryRoutes);
app.use("/api/library-activities", libraryActivityRoutes);
app.use("/api/email", require("./routes/Ticket/emailRoutes"));
app.use("/api/admissions", admissionRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/emoji", emojiRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/attendance", timeAttendanceRoutes);

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

// Khởi động scheduled jobs
const AttendanceCleanupJob = require('./jobs/attendanceCleanupJob');
const ChatCleanupJob = require('./jobs/chatCleanupJob');

AttendanceCleanupJob.start();
ChatCleanupJob.start();

module.exports = app;