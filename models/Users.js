const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
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
  jobTitle: {
    type: String,
    default: "User",
  },
  department: {
    type: String,
    default: "Unknown",
  },
  role: {
    type: String,
    enum: ["superadmin", "admin", "technical", "marcom", "hr", "bos","admission", "bod", "user"],
    default: "user",
  },
  disabled: {
    type: Boolean,
    default: false, // Tài khoản có thể bị vô hiệu hóa bởi admin
  },
  active: { 
    type: Boolean, default: false 
  }, // Mặc định là inactive
  avatarUrl: { 
    type: String,
    default: "" 
  }, // Add this field for the avatar URL

  lastLogin: {
    type: Date,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  employeeCode: { 
    type: String, 
    unique: true }, // Thêm trường Mã nhân viên
    
  lastSeen: { type: Date, default: Date.now },

  attendanceLog: [
      {
        time: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
  ],

  deviceToken: { type: String }, // Thêm trường này để lưu token thiết bị
}, { timestamps: true });


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

module.exports = mongoose.model("User", userSchema);