const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Teacher Model
const TeacherSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  fullname: { type: String, required: true },
  jobTitle: { type: String },
  phone: { type: String },
  email: { type: String, required: true },
  school: { type: Schema.Types.ObjectId, ref: "School" },
  subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
  classes: [{ type: Schema.Types.ObjectId, ref: "Class" }],
  curriculums: [{ type: Schema.Types.ObjectId, ref: "Curriculum" }],
  educationalSystem: { type: Schema.Types.ObjectId, ref: "EducationalSystem" },
  gradeLevels: [{ type: Schema.Types.ObjectId, ref: "GradeLevel" }],
  teachingAssignments: [
    {
      class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
      subjects: [{ type: Schema.Types.ObjectId, ref: "Subject", required: true }],
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index để tối ưu hiệu suất
TeacherSchema.index({ user: 1 });
TeacherSchema.index({ email: 1 });
TeacherSchema.index({ fullname: 1 });
TeacherSchema.index({ school: 1 });
TeacherSchema.index({ subjects: 1 });

// Middleware: Cập nhật updatedAt mỗi khi lưu
TeacherSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual để lấy thông tin user
TeacherSchema.virtual('userInfo', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

// Method để lấy danh sách môn học
TeacherSchema.methods.getSubjectNames = async function() {
  await this.populate('subjects', 'name code');
  return this.subjects.map(subject => subject.name);
};

// Static method để tìm teacher theo email
TeacherSchema.statics.findByEmail = function(email) {
  return this.findOne({ email });
};

// Static method để tìm teacher theo user ID
TeacherSchema.statics.findByUserId = function(userId) {
  return this.findOne({ user: userId });
};

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher; 