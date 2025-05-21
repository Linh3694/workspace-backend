const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, default: "Unknown" },
  jobTitle: { type: String, default: "Not Provided" },
});

module.exports = mongoose.model("Client", clientSchema);