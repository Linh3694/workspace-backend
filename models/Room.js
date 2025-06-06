const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Room Model
const RoomSchema = new Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ["classroom", "lab", "library", "other"], required: true },
  capacity: { type: Number },
  periodsPerDay: { type: Number, default: 10 },
  isHomeroom: { type: Boolean, default: false },
  description: { type: String },
  subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Room", RoomSchema);