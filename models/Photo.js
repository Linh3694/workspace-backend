const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Photo Model
const PhotoSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student" },
  class: { type: Schema.Types.ObjectId, ref: "Class" },
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  photoUrl: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Photo", PhotoSchema); 
 