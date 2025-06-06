const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Grade Level Model
const GradeLevelSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String },
  description: { type: String },
  order: { type: Number, required: true },
  qualities: [{
    type: String,
    enum: ["Level 1", "Level 2", "Level 3", "Level 4"],
    required: true
  }],
  school: { type: Schema.Types.ObjectId, ref: "School", required: true },
  classes: [{ type: Schema.Types.ObjectId, ref: "Class" }],
  subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("GradeLevel", GradeLevelSchema); 