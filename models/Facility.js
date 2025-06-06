const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Facility Model
const FacilitySchema = new Schema({
  name: { type: String, required: true },
  room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
  status: { type: String, enum: ["available", "in-use", "maintenance"], default: "available" },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Facility", FacilitySchema); 