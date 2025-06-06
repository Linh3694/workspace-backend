const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Subject Model
const SubjectSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, required: true },
  school: { type: Schema.Types.ObjectId, ref: "School", required: true },
  gradeLevels: [{ type: Schema.Types.ObjectId, ref: "GradeLevel", required: true }],
  needFunctionRoom: { type: Boolean, default: false },
  rooms: [{ type: Schema.Types.ObjectId, ref: "Room" }],
  curriculums: [{
    curriculum: { type: Schema.Types.ObjectId, ref: "Curriculum" },
  }],
  isParentSubject: { type: Boolean, default: false },
  parentSubject: { type: Schema.Types.ObjectId, ref: "Subject" },
  subSubjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Subject", SubjectSchema); 