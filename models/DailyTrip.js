const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DailyTripSchema = new Schema(
  {
    // Ngày của Daily Trip (theo ngày chạy)
    date: { type: Date, required: true },
    // Tham chiếu đến lịch trình định kỳ (Trip Template)
    tripTemplate: { type: Schema.Types.ObjectId, ref: "Trip", required: true },
    route: { type: Schema.Types.ObjectId, ref: "Route", required: true },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    staff: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    // Danh sách điểm danh học sinh của chuyến này
    students: [
      {
        studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
        attendance: {
          type: String,
          enum: ["pending", "present", "absent"],
          default: "pending",
        },
        note: { type: String, default: "" },
      },
    ],
    departureTime: { type: Date },
    arrivalTime: { type: Date },
    status: {
      type: String,
      enum: ["pending", "departed", "completed", "canceled"],
      default: "pending",
    },
    vehicleStatus: {
      type: String,
      enum: ["ok", "maintenance", "issue"],
      default: "ok",
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Đảm bảo mỗi Daily Trip của 1 Trip Template chỉ tồn tại 1 bản cho mỗi ngày
DailyTripSchema.index({ tripTemplate: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyTrip", DailyTripSchema);