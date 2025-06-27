const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// CommunicationBook Model
const CommunicationBookSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: false }, // Cho phép null để admin/superadmin có thể tạo
  date: { type: Date, required: true },
  ratings: {
    study: { type: String, enum: ['A', 'B', 'C'], required: true },
    discipline: { type: String, enum: ['A', 'B', 'C'], required: true },
    extracurricular: { type: String, enum: ['A', 'B', 'C'], required: true },
  },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Ensure one entry per student per calendar date
CommunicationBookSchema.index(
  { student: 1, date: 1 },
  { unique: true }
);

module.exports = mongoose.model("CommunicationBook", CommunicationBookSchema); 