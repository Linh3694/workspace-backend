// Migration: thêm field `pinned` và `pinnedAt` cho các Job cũ chưa có.
// Chạy: node scripts/migrateJobPinned.js
const mongoose = require("mongoose");
require("dotenv").config();

const Job = require("../models/Job");

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://10.1.34.162:27017/inventory";

(async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
    });
    console.log("✅ MongoDB connected");

    // Chỉ cập nhật các document còn thiếu field `pinned`
    const result = await Job.updateMany(
      { pinned: { $exists: false } },
      { $set: { pinned: false, pinnedAt: null } }
    );

    console.log(
      `✅ Đã migrate: matched=${result.matchedCount ?? result.n}, modified=${
        result.modifiedCount ?? result.nModified
      }`
    );
  } catch (error) {
    console.error("❌ Migration thất bại:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Đã ngắt kết nối MongoDB");
  }
})();
