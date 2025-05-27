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

// Instance method để cập nhật thời gian chấm công với deduplication
timeAttendanceSchema.methods.updateAttendanceTime = function (timestamp, deviceId) {
    const checkTime = new Date(timestamp);
    const deviceIdToUse = deviceId || this.deviceId;

    // Deduplication: kiểm tra xem đã có record với cùng timestamp và deviceId chưa
    const existingRawData = this.rawData.find(item =>
        Math.abs(new Date(item.timestamp).getTime() - checkTime.getTime()) < 60000 && // Trong vòng 1 phút
        item.deviceId === deviceIdToUse
    );

    if (!existingRawData) {
        // Thêm vào raw data nếu chưa có
        this.rawData.push({
            timestamp: checkTime,
            deviceId: deviceIdToUse,
            recordedAt: new Date()
        });

        // Tăng số lần chấm công
        this.totalCheckIns += 1;

        console.log(`✓ Added new attendance record: ${this.employeeCode} at ${checkTime.toISOString()}`);
    } else {
        console.log(`⚠ Skipped duplicate attendance: ${this.employeeCode} at ${checkTime.toISOString()}`);
    }

    // Cleanup rawData cũ hơn 7 ngày
    this.cleanupOldRawData();

    // Cập nhật check-in time (lần đầu tiên)
    if (!this.checkInTime || checkTime < this.checkInTime) {
        this.checkInTime = checkTime;
    }

    // Cập nhật check-out time (lần cuối cùng)
    if (!this.checkOutTime || checkTime > this.checkOutTime) {
        this.checkOutTime = checkTime;
    }

    return this;
};

// Instance method để cleanup rawData cũ hơn 7 ngày
timeAttendanceSchema.methods.cleanupOldRawData = function () {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const originalCount = this.rawData.length;
    this.rawData = this.rawData.filter(item =>
        new Date(item.recordedAt || item.timestamp) > sevenDaysAgo
    );

    const cleanedCount = originalCount - this.rawData.length;
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old rawData records for ${this.employeeCode}`);
    }

    return this;
};

// Static method để tìm hoặc tạo record cho một ngày
timeAttendanceSchema.statics.findOrCreateDayRecord = async function (employeeCode, date, deviceId) {
    // Thống nhất timezone: chuyển date về đầu ngày UTC để tránh confusion timezone
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);

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

// Static method để parse timestamp từ máy chấm công với timezone chuẩn
timeAttendanceSchema.statics.parseAttendanceTimestamp = function (dateTimeString) {
    // Thống nhất xử lý timezone:
    // 1. Nếu không có timezone info -> giả định là GMT+7 (VN time)
    // 2. Convert về UTC để lưu database
    // 3. Frontend sẽ convert lại theo timezone của user

    if (!dateTimeString) {
        throw new Error('DateTime string is required');
    }

    let timestamp;

    if (typeof dateTimeString === 'string') {
        // Kiểm tra xem có timezone info không
        const hasTimezone = dateTimeString.includes('Z') ||
            dateTimeString.includes('+') ||
            dateTimeString.includes('-');

        if (!hasTimezone) {
            // Không có timezone -> giả định là VN time (GMT+7)
            // Chuyển về UTC bằng cách trừ 7 tiếng
            const vnTime = new Date(dateTimeString);
            timestamp = new Date(vnTime.getTime() - (7 * 60 * 60 * 1000));
            console.log(`📅 Converted VN time ${dateTimeString} to UTC: ${timestamp.toISOString()}`);
        } else {
            // Đã có timezone info -> parse trực tiếp
            timestamp = new Date(dateTimeString);
        }
    } else {
        // Đã là Date object
        timestamp = new Date(dateTimeString);
    }

    if (isNaN(timestamp.getTime())) {
        throw new Error(`Invalid datetime format: ${dateTimeString}`);
    }

    return timestamp;
};

// Static method để cleanup rawData cũ cho tất cả records
timeAttendanceSchema.statics.cleanupAllOldRawData = async function () {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
        // Sử dụng aggregation để cleanup hiệu quả
        const result = await this.updateMany(
            {
                rawData: {
                    $elemMatch: {
                        $or: [
                            { recordedAt: { $lt: sevenDaysAgo } },
                            { recordedAt: { $exists: false }, timestamp: { $lt: sevenDaysAgo } }
                        ]
                    }
                }
            },
            {
                $pull: {
                    rawData: {
                        $or: [
                            { recordedAt: { $lt: sevenDaysAgo } },
                            { recordedAt: { $exists: false }, timestamp: { $lt: sevenDaysAgo } }
                        ]
                    }
                }
            }
        );

        console.log(`🧹 Bulk cleanup completed: ${result.modifiedCount} records cleaned`);
        return result;
    } catch (error) {
        console.error('Error during bulk rawData cleanup:', error);
        throw error;
    }
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