const mongoose = require("mongoose");

const timeAttendanceSchema = new mongoose.Schema(
    {
        // Mã nhân viên từ máy chấm công (fingerprint code)
        employeeCode: {
            type: String,
            required: true,
            index: true
        },

        // Ngày chấm công (chỉ ngày, không bao gồm giờ)
        date: {
            type: Date,
            required: true,
            index: true
        },

        // Thời gian check-in (lần đầu tiên trong ngày)
        checkInTime: {
            type: Date,
            default: null
        },

        // Thời gian check-out (lần cuối cùng trong ngày)
        checkOutTime: {
            type: Date,
            default: null
        },

        // Số lần chấm công trong ngày
        totalCheckIns: {
            type: Number,
            default: 0
        },

        // ID thiết bị chấm công
        deviceId: {
            type: String,
            default: null
        },

        // Tracker ID từ hệ thống cũ
        trackerId: {
            type: String,
            default: null
        },

        // Reference đến User model (nếu có)
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
            default: null
        },

        // Trạng thái xử lý
        status: {
            type: String,
            enum: ["active", "processed", "error"],
            default: "active"
        },

        // Ghi chú
        notes: {
            type: String,
            default: null
        },

        // Dữ liệu raw từ máy chấm công
        rawData: [{
            timestamp: Date,
            deviceId: String,
            recordedAt: { type: Date, default: Date.now }
        }]
    },
    {
        timestamps: true,
        // Tạo compound index để đảm bảo unique theo employeeCode và date
        index: { employeeCode: 1, date: 1 }
    }
);

// Compound index để đảm bảo chỉ có 1 record cho mỗi nhân viên mỗi ngày
timeAttendanceSchema.index({ employeeCode: 1, date: 1 }, { unique: true });

// Index để tìm kiếm nhanh theo ngày
timeAttendanceSchema.index({ date: -1 });

// Instance method để cập nhật thời gian chấm công
timeAttendanceSchema.methods.updateAttendanceTime = function (timestamp, deviceId) {
    const checkTime = new Date(timestamp);

    // Thêm vào raw data
    this.rawData.push({
        timestamp: checkTime,
        deviceId: deviceId || this.deviceId
    });

    // Cập nhật check-in time (lần đầu tiên)
    if (!this.checkInTime || checkTime < this.checkInTime) {
        this.checkInTime = checkTime;
    }

    // Cập nhật check-out time (lần cuối cùng)
    if (!this.checkOutTime || checkTime > this.checkOutTime) {
        this.checkOutTime = checkTime;
    }

    // Tăng số lần chấm công
    this.totalCheckIns += 1;

    return this;
};

// Static method để tìm hoặc tạo record cho một ngày
timeAttendanceSchema.statics.findOrCreateDayRecord = async function (employeeCode, date, deviceId) {
    // Chuyển date về đầu ngày (00:00:00)
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    // Tìm record existing
    let record = await this.findOne({
        employeeCode: employeeCode,
        date: dayStart
    });

    // Nếu không có thì tạo mới
    if (!record) {
        record = new this({
            employeeCode: employeeCode,
            date: dayStart,
            deviceId: deviceId,
            rawData: []
        });
    }

    return record;
};

// Static method để lấy thống kê attendance
timeAttendanceSchema.statics.getAttendanceStats = async function (startDate, endDate, employeeCode) {
    const match = {};

    if (startDate && endDate) {
        match.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }

    if (employeeCode) {
        match.employeeCode = employeeCode;
    }

    return await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: "$employeeCode",
                totalDays: { $sum: 1 },
                totalCheckIns: { $sum: "$totalCheckIns" },
                avgCheckIns: { $avg: "$totalCheckIns" },
                firstDate: { $min: "$date" },
                lastDate: { $max: "$date" }
            }
        },
        { $sort: { totalDays: -1 } }
    ]);
};

module.exports = mongoose.model("TimeAttendance", timeAttendanceSchema); 