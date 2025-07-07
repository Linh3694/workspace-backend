const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// PeriodDefinition Model
const PeriodDefinitionSchema = new Schema({
  periodNumber: {
    type: Number,
    required: true,
    min: 0,
    max: 25
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: false
  },
  type: {
    type: String,
    enum: ["regular", "morning", "lunch", "nap", "snack", "dismissal"],
    default: "regular"
  },
  schoolYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SchoolYear",
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("PeriodDefinition", PeriodDefinitionSchema); 