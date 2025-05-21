const mongoose = require("mongoose");

const parentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Parent", parentSchema);