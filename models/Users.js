const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  // Trường từ SIS.js
  username: {
    type: String,
    unique: true,
    sparse: true, // Cho phép null/undefined và chỉ check unique khi có giá trị
    trim: true
  },
  
  phone: {
    type: String,
    trim: true,
    sparse: true, // Cho phép null/undefined và chỉ check unique khi có giá trị
  },
  
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  
  password: {
    type: String,
    minlength: 8, // Đảm bảo mật khẩu có độ dài tối thiểu
    default: null
  },
  
  fullname: {
    type: String,
    required: true,
  },
  
  // Trường từ cả hai file
  jobTitle: {
    type: String,
    default: "User",
  },
  
  department: {
    type: String,
    default: "Unknown",
  },
  
  // Cập nhật role để hỗ trợ cả hai hệ thống
  role: {
    type: String,
    enum: [
      "admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user", "librarian"
    ],
    default: "user",
  },
  
  disabled: {
    type: Boolean,
    default: false, // Tài khoản có thể bị vô hiệu hóa bởi admin
  },
  
  active: { 
    type: Boolean, 
    default: true // Đổi default thành true để tương thích với SIS.js
  },
  
  avatarUrl: { 
    type: String,
    default: "" 
  },

  lastLogin: {
    type: Date,
  },
  
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  employeeCode: { 
    type: String, 
    unique: true,
    sparse: true 
  },

  // Authentication providers
  provider: {
    type: String,
    default: 'local' // local, microsoft, apple, google
  },
  
  microsoftId: {
    type: String,
    sparse: true
  },
  
  appleId: {
    type: String,
    sparse: true
  },
    
  lastSeen: { 
    type: Date, 
    default: Date.now 
  },

  // Trường chấm công từ Users.js gốc
  attendanceLog: [
    {
      time: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
  ],

  // Trường thiết bị từ Users.js gốc
  deviceToken: { 
    type: String 
  },
  
  // Các trường timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { 
  timestamps: true // Tự động quản lý createdAt và updatedAt
});

// Index để tối ưu hiệu suất
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ employeeCode: 1 });
userSchema.index({ role: 1 });
userSchema.index({ active: 1 });

// Middleware: Hash mật khẩu trước khi lưu
userSchema.pre('save', async function (next) {
  // Nếu password không tồn tại hoặc không được thay đổi, bỏ qua
  if (!this.password || !this.isModified('password')) {
    return next();
  }

  // Hash mật khẩu nếu chưa được hash
  const isHashed = this.password.startsWith('$2a$') || this.password.startsWith('$2b$');
  if (!isHashed) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  next();
});

// Phương thức kiểm tra mật khẩu
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Middleware: Cập nhật updatedAt mỗi khi lưu
userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual để có thể sử dụng cả username và email để đăng nhập
userSchema.virtual('loginIdentifier').get(function() {
  return this.username || this.email;
});

// Method để tìm user bằng username, email hoặc phone
userSchema.statics.findByLogin = function(identifier) {
  return this.findOne({
    $or: [
      { username: identifier },
      { email: identifier },
      { phone: identifier }
    ]
  });
};

module.exports = mongoose.model("User", userSchema);