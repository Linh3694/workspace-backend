const mongoose = require("mongoose");

const communicationBookSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Students", required: true },
    date: { type: Date, required: true },
    content: { type: String, required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Parent" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommunicationBook", communicationBookSchema);