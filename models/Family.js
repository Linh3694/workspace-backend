const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Family Model
const FamilySchema = new Schema({
  familyCode: { type: String, required: true, unique: true },
  parents: [{
    parent: { type: Schema.Types.ObjectId, ref: "Parent" },
    relationship: { type: String, enum: ["Bố", "Mẹ", "Khác"] }
  }],
  students: [{ type: Schema.Types.ObjectId, ref: "Student" }],
  address: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index để tối ưu hiệu suất
FamilySchema.index({ familyCode: 1 });
FamilySchema.index({ "parents.parent": 1 });
FamilySchema.index({ students: 1 });
FamilySchema.index({ address: 1 });

// Middleware: Cập nhật updatedAt mỗi khi lưu
FamilySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual để lấy số lượng phụ huynh
FamilySchema.virtual('parentCount').get(function() {
  return this.parents ? this.parents.length : 0;
});

// Virtual để lấy số lượng học sinh
FamilySchema.virtual('studentCount').get(function() {
  return this.students ? this.students.length : 0;
});

// Method để thêm parent vào family
FamilySchema.methods.addParent = function(parentId, relationship = "Khác") {
  // Kiểm tra parent đã tồn tại chưa
  const existingParent = this.parents.find(p => p.parent.equals(parentId));
  if (!existingParent) {
    this.parents.push({
      parent: parentId,
      relationship: relationship
    });
  }
  return this.save();
};

// Method để xóa parent khỏi family
FamilySchema.methods.removeParent = function(parentId) {
  this.parents = this.parents.filter(p => !p.parent.equals(parentId));
  return this.save();
};

// Method để thêm student vào family
FamilySchema.methods.addStudent = function(studentId) {
  if (!this.students.includes(studentId)) {
    this.students.push(studentId);
  }
  return this.save();
};

// Method để xóa student khỏi family
FamilySchema.methods.removeStudent = function(studentId) {
  this.students = this.students.filter(id => !id.equals(studentId));
  return this.save();
};

// Method để cập nhật relationship của parent
FamilySchema.methods.updateParentRelationship = function(parentId, newRelationship) {
  const parent = this.parents.find(p => p.parent.equals(parentId));
  if (parent) {
    parent.relationship = newRelationship;
    return this.save();
  }
  throw new Error('Parent not found in this family');
};

// Static method để tìm family theo familyCode
FamilySchema.statics.findByFamilyCode = function(familyCode) {
  return this.findOne({ familyCode });
};

// Static method để tìm family theo parent ID
FamilySchema.statics.findByParentId = function(parentId) {
  return this.find({ "parents.parent": parentId });
};

// Static method để tìm family theo student ID
FamilySchema.statics.findByStudentId = function(studentId) {
  return this.find({ students: studentId });
};

// Static method để tìm family theo address
FamilySchema.statics.findByAddress = function(address) {
  return this.find({ address: { $regex: address, $options: 'i' } });
};

// Static method để lấy statistics
FamilySchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalFamilies: { $sum: 1 },
        totalParents: { $sum: { $size: "$parents" } },
        totalStudents: { $sum: { $size: "$students" } },
        avgParentsPerFamily: { $avg: { $size: "$parents" } },
        avgStudentsPerFamily: { $avg: { $size: "$students" } }
      }
    }
  ]);
  
  return stats[0] || {
    totalFamilies: 0,
    totalParents: 0,
    totalStudents: 0,
    avgParentsPerFamily: 0,
    avgStudentsPerFamily: 0
  };
};

const Family = mongoose.model("Family", FamilySchema);

module.exports = Family; 