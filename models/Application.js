const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  birthdate: { type: Date, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  graduationSchools: [
    {
      school: { type: String, required: true },
      major: { type: String, required: true },
      graduationYear: { type: String }  // Không bắt buộc
    }
  ],
  highestDegree: { type: String, enum: ["THPT", "Cao đẳng", "Đại học", "Thạc sĩ", "Tiến sĩ"] },
  englishLevel: { type: String },
  expectedSalary: { type: String },
  profilePicture: { type: String },
  cvFile: { type: String, required: true },
  appliedJob: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  openPositionTitle: { type: String },
  openPositionType: { type: String, enum: ["fulltime", "parttime", "intern"] },
  createdAt: { type: Date, default: Date.now },
});

ApplicationSchema.pre('save', function(next) {
  if (!this.appliedJob && !this.openPositionTitle) {
    next(new Error('Either appliedJob or openPositionTitle must be provided'));
  } else if (this.appliedJob && this.openPositionTitle) {
    next(new Error('Cannot specify both appliedJob and openPositionTitle'));
  } else {
    next();
  }
});

module.exports = mongoose.model("Application", ApplicationSchema);