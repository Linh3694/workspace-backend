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

// Instance method để cập nhật thời gian chấm công với logic check-in/check-out thông minh
timeAttendanceSchema.methods.updateAttendanceTime = function (timestamp, deviceId) {
    const checkTime = new Date(timestamp);
    const deviceIdToUse = deviceId || this.deviceId;

    // CẢI THIỆN: Deduplication nghiêm ngặt hơn
    // Kiểm tra exact timestamp match (trong vòng 30 giây) để tránh duplicate hoàn toàn
    const existingRawData = this.rawData.find(item => {
        const timeDiff = Math.abs(new Date(item.timestamp).getTime() - checkTime.getTime());
        const sameDevice = item.deviceId === deviceIdToUse;

        return timeDiff < 30000 && sameDevice; // 30 giây để tránh duplicate
    });

    if (existingRawData) {
        console.log(`⚠️  Duplicate attendance detected within 30 seconds, skipping`);
        return this;
    }

    // Thêm vào raw data
    this.rawData.push({
        timestamp: checkTime,
        deviceId: deviceIdToUse,
        recordedAt: new Date()
    });

    // Cleanup rawData cũ hơn 7 ngày
    this.cleanupOldRawData();

    // LOGIC THÔNG MINH: Xác định check-in vs check-out
    this.updateCheckInOutTimes(checkTime);

    return this;
};

// Helper method để cập nhật check-in/check-out thông minh
timeAttendanceSchema.methods.updateCheckInOutTimes = function (newTime) {
    const currentHour = newTime.getHours();
    
    // Logic phân biệt check-in vs check-out dựa trên giờ
    const isLikelyCheckIn = currentHour >= 6 && currentHour <= 12;  // 6h-12h: check-in
    const isLikelyCheckOut = currentHour >= 15 && currentHour <= 22; // 15h-22h: check-out
    
    // Nếu chưa có check-in hoặc thời gian mới rất sớm
    if (!this.checkInTime || (isLikelyCheckIn && newTime < this.checkInTime)) {
        console.log(`📥 Setting check-in time: ${newTime.toISOString()}`);
        this.checkInTime = newTime;
        this.totalCheckIns = Math.max(1, this.totalCheckIns);
    }
    // Nếu chưa có check-out hoặc thời gian mới rất muộn
    else if (!this.checkOutTime || (isLikelyCheckOut && newTime > this.checkOutTime)) {
        console.log(`📤 Setting check-out time: ${newTime.toISOString()}`);
        this.checkOutTime = newTime;
        this.totalCheckIns = Math.max(2, this.totalCheckIns);
    }
    // Nếu có cả check-in và check-out rồi
    else if (this.checkInTime && this.checkOutTime) {
        // Xác định nên update check-in hay check-out dựa trên khoảng cách thời gian
        const distanceToCheckIn = Math.abs(newTime - this.checkInTime);
        const distanceToCheckOut = Math.abs(newTime - this.checkOutTime);
        
        if (isLikelyCheckIn && distanceToCheckIn < distanceToCheckOut) {
            // Update check-in nếu gần hơn và là giờ sáng
            console.log(`🔄 Updating check-in time: ${this.checkInTime.toISOString()} → ${newTime.toISOString()}`);
            this.checkInTime = newTime;
        } else if (isLikelyCheckOut && distanceToCheckOut < distanceToCheckIn) {
            // Update check-out nếu gần hơn và là giờ chiều
            console.log(`🔄 Updating check-out time: ${this.checkOutTime.toISOString()} → ${newTime.toISOString()}`);
            this.checkOutTime = newTime;
        } else {
            console.log(`ℹ️  Ignoring additional attendance at ${newTime.toISOString()} (already have check-in and check-out)`);
        }
    }
    // Fallback: nếu chỉ có check-in, thì đây là check-out
    else if (this.checkInTime && !this.checkOutTime) {
        if (newTime > this.checkInTime) {
            console.log(`📤 Setting check-out time: ${newTime.toISOString()}`);
            this.checkOutTime = newTime;
            this.totalCheckIns = 2;
        } else {
            console.log(`🔄 Updating check-in time: ${this.checkInTime.toISOString()} → ${newTime.toISOString()}`);
            this.checkInTime = newTime;
        }
    }
    
    // Đảm bảo check-in luôn trước check-out
    if (this.checkInTime && this.checkOutTime && this.checkInTime > this.checkOutTime) {
        console.log(`🔀 Swapping check-in and check-out times`);
        const temp = this.checkInTime;
        this.checkInTime = this.checkOutTime;
        this.checkOutTime = temp;
    }
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

    return this;
};

// Instance method để cleanup duplicates trong rawData hiện có
timeAttendanceSchema.methods.removeDuplicateRawData = function () {
    const originalCount = this.rawData.length;

    if (originalCount === 0) return this;

    // Tạo Map để track unique entries theo timestamp + deviceId
    const uniqueMap = new Map();
    const uniqueRawData = [];

    this.rawData.forEach(item => {
        const timestamp = new Date(item.timestamp).getTime();
        const deviceId = item.deviceId;
        const key = `${timestamp}-${deviceId}`;

        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, true);
            uniqueRawData.push(item);
        }
    });

    this.rawData = uniqueRawData;

    // Recalculate totalCheckIns
    const oldTotalCheckIns = this.totalCheckIns;
    this.totalCheckIns = this.rawData.length;

    const removedCount = originalCount - this.rawData.length;
    if (removedCount > 0) {
        // Recalculate check-in and check-out times based on remaining data
        this.recalculateCheckTimes();
    }

    return this;
};

// Instance method để tính lại check-in và check-out times từ rawData
timeAttendanceSchema.methods.recalculateCheckTimes = function () {
    if (this.rawData.length === 0) {
        this.checkInTime = null;
        this.checkOutTime = null;
        return this;
    }

    // Sắp xếp rawData theo timestamp
    const sortedRawData = this.rawData.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const oldCheckIn = this.checkInTime;
    const oldCheckOut = this.checkOutTime;

    this.checkInTime = new Date(sortedRawData[0].timestamp);
    this.checkOutTime = new Date(sortedRawData[sortedRawData.length - 1].timestamp);

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

        return result;
    } catch (error) {
        console.error('Error during bulk rawData cleanup:', error);
        throw error;
    }
};

// Static method để cleanup duplicates cho tất cả records
timeAttendanceSchema.statics.cleanupAllDuplicateRawData = async function () {
    try {
        // Lấy tất cả records có rawData
        const records = await this.find({
            rawData: { $exists: true, $ne: [] }
        }).limit(2000); // Process in larger batches

        let totalProcessed = 0;
        let totalDuplicatesRemoved = 0;
        let totalRecordsModified = 0;

        for (const record of records) {
            const originalCount = record.rawData.length;

            // Remove duplicates
            record.removeDuplicateRawData();

            const newCount = record.rawData.length;
            const duplicatesRemoved = originalCount - newCount;

            if (duplicatesRemoved > 0) {
                await record.save();
                totalRecordsModified++;
                totalDuplicatesRemoved += duplicatesRemoved;


            }

            totalProcessed++;
        }

        const summary = {
            totalProcessed,
            totalRecordsModified,
            totalDuplicatesRemoved
        };

        return summary;

    } catch (error) {
        console.error('❌ Error during bulk duplicate cleanup:', error);
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