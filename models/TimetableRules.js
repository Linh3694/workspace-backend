const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TimetableRulesSchema = new Schema({
  schoolYearId: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true },
  maxPeriodsPerDayPerSubject: { type: Number, default: 2 },
  maxConsecutivePeriods: { type: Number, default: 3 },
  minPeriodGap: { type: Number, default: 2 },
  restrictedSubjects: [{
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
    allowedPeriods: [Number]
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("TimetableRules", TimetableRulesSchema); 