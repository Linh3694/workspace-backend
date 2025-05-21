// models/index.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Schema cho Tuyến Xe
 */
const RouteSchema = new Schema({
  name: { type: String, required: true },
  addresses: [{ type: String }], // Danh sách các điểm dừng
  routeType: { type: String, enum: ["Đón học sinh", "Trả học sinh"], required: true },
  description: { type: String },
  active: { type: Boolean, default: true },
});
const Route = mongoose.model("Route", RouteSchema);

/**
 * Schema cho Phương Tiện
 */
const VehicleSchema = new Schema({
  id: { type: String, required: true }, 
  licensePlate: { type: String, required: true, unique: true },
  driverName: { type: String, required: true },
  phone: { type: String, required: true },
  seatingCapacity: { type: Number, required: true },
  status: {
    type: String,
    enum: ["active", "maintenance", "inactive"],
    default: "active",
  },
});
const Vehicle = mongoose.model("Vehicle", VehicleSchema);

/**
 * Schema cho User (nhân viên, quản trị, …)
 */
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
});
const Users = mongoose.model("Users", UserSchema);

/**
 * Schema cho Học Sinh
 */
const StudentSchema = new Schema({
  name: { type: String, required: true },
  className: { type: String },
});
const Students = mongoose.model("Students", StudentSchema);

/**
 * Schema cho Chuyến Xe (Trip)
 * Liên kết tuyến, xe, nhân viên phụ trách và danh sách học sinh đi theo chuyến
 */
const TripSchema = new Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  route: { type: Schema.Types.ObjectId, ref: "Route", required: true },
  vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
  staff: { type: Schema.Types.ObjectId, ref: "Users", required: true },
  students: [
    {
      studentId: { type: Schema.Types.ObjectId, ref: "Students", required: true },
      attendance: {
        type: String,
        enum: ["pending", "present", "absent"],
        default: "pending",
      },
      confidence: { type: Number, default: 0 },
      updatedAt: { type: Date },
    },
  ],
  departureTime: { type: Date },
  arrivalTime: { type: Date },
  status: {
    type: String,
    enum: ["planned", "ongoing", "completed", "canceled"],
    default: "planned",
  },
});

// Pre-save hook để kiểm tra lịch trình trùng lặp (theo route và vehicle)
TripSchema.pre("save", async function (next) {
  const trip = this;
  // Tìm xem có lịch trình nào của cùng route và vehicle mà khoảng thời gian giao nhau không
  const overlappingTrip = await trip.constructor.findOne({
    _id: { $ne: trip._id },
    route: trip.route,
    vehicle: trip.vehicle,
    $or: [
      {
        startDate: { $lte: trip.endDate },
        endDate: { $gte: trip.startDate },
      },
    ],
  });
  if (overlappingTrip) {
    return next(new Error("Lịch trình trùng lặp với lịch trình đã tồn tại."));
  }
  next();
});

const Trip = mongoose.model("Trip", TripSchema);

module.exports = {
  Route,
  Vehicle,
  Users,
  Students,
  Trip,
};