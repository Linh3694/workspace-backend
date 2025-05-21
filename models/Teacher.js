const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fullName: { type: String, required: true },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
    phone: { type: String },
    email: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Teacher", teacherSchema);