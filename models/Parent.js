const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Parent Model
const ParentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  fullname: { type: String, required: true },
  phone: { type: String },
  email: { type: String, required: true },
  students: [{ type: Schema.Types.ObjectId, ref: "Student" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index để tối ưu hiệu suất
ParentSchema.index({ user: 1 });
ParentSchema.index({ email: 1 });
ParentSchema.index({ fullname: 1 });
ParentSchema.index({ phone: 1 });
ParentSchema.index({ students: 1 });

// Middleware: Cập nhật updatedAt mỗi khi lưu
ParentSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual để lấy thông tin user
ParentSchema.virtual('userInfo', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

// Virtual để lấy số lượng con
ParentSchema.virtual('childrenCount').get(function() {
  return this.students ? this.students.length : 0;
});

// Method để thêm student
ParentSchema.methods.addStudent = function(studentId) {
  if (!this.students.includes(studentId)) {
    this.students.push(studentId);
  }
  return this.save();
};

// Method để xóa student
ParentSchema.methods.removeStudent = function(studentId) {
  this.students = this.students.filter(id => !id.equals(studentId));
  return this.save();
};

// Static method để tìm parent theo email
ParentSchema.statics.findByEmail = function(email) {
  return this.findOne({ email });
};

// Static method để tìm parent theo user ID
ParentSchema.statics.findByUserId = function(userId) {
  return this.findOne({ user: userId });
};

// Static method để tìm parent theo student ID
ParentSchema.statics.findByStudentId = function(studentId) {
  return this.find({ students: studentId });
};

// Static method để tìm parent theo phone
ParentSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone });
};

const Parent = mongoose.model("Parent", ParentSchema);

module.exports = Parent; 