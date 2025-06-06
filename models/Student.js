const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Student Model
const StudentSchema = new Schema({
  studentCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  gender: { type: String, enum: ["male", "female", "other"] },
  birthDate: { type: Date },
  address: { type: String },
  email: { type: String },
  parents: [{ type: Schema.Types.ObjectId, ref: "Parent" }],
  status: { type: String, enum: ["active", "transferred", "dropped"], default: "active" },
  class: [{ type: Schema.Types.ObjectId, ref: "Class" }],
  avatarUrl: { type: String },
  family: { type: Schema.Types.ObjectId, ref: "Family" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Student", StudentSchema); 