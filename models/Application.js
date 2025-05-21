const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  birthdate: { type: Date, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  graduationSchools: [
    {
      schoolName: { type: String, required: true },
      major: { type: String, required: true }
    }
  ],
  highestDegree: { type: String, enum: ["THPT", "Cao đẳng", "Đại học", "Thạc sĩ", "Tiến sĩ"] },
  englishLevel: { type: String },
  expectedSalary: { type: String },
  profilePicture: { type: String },
  cvFile: { type: String, required: true },
  appliedJob: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Application", ApplicationSchema);