const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  requirements: { type: String, required: true },
  location: { type: String, },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
  jobType: { type: String, enum: ["fulltime", "parttime", "intern"], required: true },
  urgent: { type: Boolean, default: false },
  deadline: { type: Date },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Job", JobSchema);