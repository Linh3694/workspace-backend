const mongoose = require('mongoose');
const TimeAttendance = require('../models/TimeAttendance');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://10.1.34.162:27017/inventory", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
        });
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Seed attendance data
const seedAttendanceData = async () => {
    try {
        // Xóa dữ liệu cũ
        await TimeAttendance.deleteMany({});
        console.log('Đã xóa dữ liệu attendance cũ');

        // Tạo dữ liệu mẫu cho hôm nay
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Giờ check in và check out mẫu
        const checkInTime = new Date(today);
        checkInTime.setHours(8, 15, 0, 0); // 8:15 AM

        const checkOutTime = new Date(today);
        checkOutTime.setHours(17, 30, 0, 0); // 5:30 PM

        // Tạo record attendance cho employeeCode mẫu
        const sampleEmployeeCodes = ['EMP001', 'EMP002', 'EMP003', 'NV001', 'NV002'];

        for (const employeeCode of sampleEmployeeCodes) {
            const attendanceRecord = new TimeAttendance({
                employeeCode: employeeCode,
                date: today,
                checkInTime: checkInTime,
                checkOutTime: checkOutTime,
                totalCheckIns: 2,
                deviceId: 'DEVICE_001',
                status: 'active',
                rawData: [
                    {
                        timestamp: checkInTime,
                        deviceId: 'DEVICE_001',
                        recordedAt: checkInTime
                    },
                    {
                        timestamp: checkOutTime,
                        deviceId: 'DEVICE_001',
                        recordedAt: checkOutTime
                    }
                ]
            });

            await attendanceRecord.save();
            console.log(`Đã tạo attendance record cho ${employeeCode}`);
        }

        // Tạo thêm dữ liệu cho ngày hôm qua
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        for (const employeeCode of sampleEmployeeCodes) {
            const checkInYesterday = new Date(yesterday);
            checkInYesterday.setHours(8, 0, 0, 0);

            const checkOutYesterday = new Date(yesterday);
            checkOutYesterday.setHours(17, 15, 0, 0);

            const attendanceRecord = new TimeAttendance({
                employeeCode: employeeCode,
                date: yesterday,
                checkInTime: checkInYesterday,
                checkOutTime: checkOutYesterday,
                totalCheckIns: 2,
                deviceId: 'DEVICE_001',
                status: 'active',
                rawData: [
                    {
                        timestamp: checkInYesterday,
                        deviceId: 'DEVICE_001',
                        recordedAt: checkInYesterday
                    },
                    {
                        timestamp: checkOutYesterday,
                        deviceId: 'DEVICE_001',
                        recordedAt: checkOutYesterday
                    }
                ]
            });

            await attendanceRecord.save();
            console.log(`Đã tạo attendance record cho ${employeeCode} (hôm qua)`);
        }

        console.log('Hoàn thành seed dữ liệu attendance');
    } catch (error) {
        console.error('Lỗi khi seed dữ liệu:', error);
    }
};

// Run seeding
const runSeed = async () => {
    await connectDB();
    await seedAttendanceData();
    await mongoose.connection.close();
    console.log('Đã đóng kết nối database');
    process.exit(0);
};

// Run if called directly
if (require.main === module) {
    runSeed();
}

module.exports = { seedAttendanceData }; 