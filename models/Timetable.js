const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
  {
    schoolYear: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolYear", required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    timeSlot: {
      dayOfWeek: { type: String, enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], required: true },
      startTime: { type: String, required: true }, // Ví dụ: "08:00"
      endTime: { type: String, required: true } // Ví dụ: "09:00"
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Timetable", timetableSchema);