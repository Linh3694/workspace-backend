// app.js - Recruitment Backend
const express = require("express");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const cors = require("cors");
const passport = require("passport");
const session = require("express-session");
require("dotenv").config();
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

// Import routes cho Recruitment
const authMicrosoftRoutes = require("./routes/Auth/authMicrosoft");
const jobRoutes = require("./routes/Recruitment/jobRoutes");
const applicationRoutes = require("./routes/Recruitment/applicationRoutes");
const userRoutes = require("./routes/Management/users");

const app = express();

// Kết nối MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
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
const subDirs = ["CV", "Profile"];
subDirs.forEach(dir => {
  const dirPath = path.join(uploadPath, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
});

// Middlewares
// Middlewares
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://wis.wellspring.edu.vn',
    'https://api-dev.wellspring.edu.vn',
    'https://library.wellspring.edu.vn',
    'https://tuyendung.wellspring.edu.vn',
    'https://career.wellspring.edu.vn',
    'https://honor.wellspring.edu.vn',
    'https://olddata.wellspring.edu.vn'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // Một số browsers (IE11) choke on 204
};

app.use(cors(corsOptions));

// Xử lý preflight OPTIONS request cho tất cả routes
app.options('*', cors(corsOptions));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
sessionRedisClient.connect()
  .then(() => console.log("✅ Redis connected for sessions"))
  .catch(err => console.error("❌ Redis connection failed:", err.message));

// Cấu hình session và passport
app.use(
  session({
    store: new RedisStore({ 
      client: sessionRedisClient,
      prefix: 'recruitment:sess:'
    }),
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === 'production', // true cho production HTTPS
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // 'none' cho cross-domain HTTPS
    },
    name: 'recruitment.sid'
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Định tuyến - Chỉ Recruitment routes
app.use("/api/auth", authMicrosoftRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/users", userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'Recruitment Backend',
    timestamp: new Date().toISOString() 
  });
});

// Khởi động server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Recruitment Backend is running on port ${PORT}`);
});

module.exports = app;
