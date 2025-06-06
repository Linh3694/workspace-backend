const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Admission Model
const AdmissionSchema = new Schema({
  fullName: { type: String, required: true },
  dateOfBirth: { type: String, required: true },
  gender: { type: String },
  currentClass: { type: String },
  appliedClass: { type: String, required: true },
  currentSchool: { type: String },
  ace: [{ type: String }],
  isChildOfStaff: { type: Boolean, default: false },
  parents: [{
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    relationship: { type: String },
    address: { type: String }
  }],
  howParentLearned: { type: String },
  expectedSemester: { type: String },
  admissionSupport: { type: String },
  notes: { type: String },
  status: {
    type: String,
    enum: ['Follow up', 'Test', 'After test', 'Offer', 'Paid', 'Lost'],
    default: 'Follow up'
  },
  followUpType: {
    type: String,
    enum: ['Cold', 'Warm', 'Hot'],
    default: 'Cold'
  },
  followUpNote: { type: String },
  entranceTests: [{
    testDate: { type: String, required: true },
    result: {
      type: String,
      enum: ['Đạt', 'Không đạt'],
      required: true
    },
    note: { type: String }
  }],
}, {
  timestamps: true
});

module.exports = mongoose.model("Admission", AdmissionSchema); 