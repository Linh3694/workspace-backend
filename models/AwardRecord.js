// backend/models/AwardRecord.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const StudentAwardSchema = new Schema(
  {
    student: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Student", 
      required: true 
    },
    note: { 
      type: String, 
    },
    noteEng: { 
      type: String, 
    },
    activity: [{
      type: String,
    }],
    activityEng: [{
      type: String,
    }],
    score: {
      type: String,
    },
    exam: {
      type: String,
    },
  },
  { _id: false }
);

const AwardClassSchema = new Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    note: { type: String },
    noteEng: { type: String },
  },
  { _id: false }
);

const SubAwardDetailSchema = new Schema(
  {
    type: { 
      type: String, 
      enum: ["month", "semester", "year", "custom", "custom_with_description"], 
      required: true 
    },
    month: { type: Number },
    semester: { type: Number },
    year: { type: Number },
    label: { type: String },
    labelEng: { type: String },
    description: { type: String },
    descriptionEng: { type: String },
    schoolYear: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolYear" },
    priority: { type: Number, default: 0 },
  },
  { _id: false }
);

const AwardRecordSchema = new Schema(
  {
    awardCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AwardCategory",
    },
    awardClasses: [AwardClassSchema], // Dùng subdocument cho awardClasses

    // Thông tin chi tiết của subAward (nếu award theo tháng, học kỳ, năm hay tùy chỉnh)
    subAward: {
      type: SubAwardDetailSchema,
      required: true,
    },
    students: [StudentAwardSchema], // Mỗi phần tử gồm { student, note }
    reason: { type: String },
    meta: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AwardRecord", AwardRecordSchema);