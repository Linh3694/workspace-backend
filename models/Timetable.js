const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Timetable Model
const TimetableSchema = new Schema({
  schoolYear: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  subject: { type: Schema.Types.ObjectId, ref: "Subject" },
  teachers: [{ type: Schema.Types.ObjectId, ref: "Teacher" }], // tối đa 2 GV
  room: { type: Schema.Types.ObjectId, ref: "Room", required: false },
  status: { type: String, enum: ["draft", "ready"], default: "ready" },
  timeSlot: {
    dayOfWeek: { type: String, enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Timetable", TimetableSchema); 