const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// EducationalSystem Model
const EducationalSystemSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  school: { type: Schema.Types.ObjectId, ref: "School", required: true },
  curriculums: [{ type: Schema.Types.ObjectId, ref: "Curriculum" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EducationalSystem", EducationalSystemSchema); 