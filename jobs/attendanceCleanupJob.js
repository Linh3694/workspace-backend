const cron = require('node-cron');
const TimeAttendance = require('../models/TimeAttendance');

/**
 * Scheduled Job để cleanup rawData cũ hơn 7 ngày
 * Chạy hằng ngày lúc 2:00 AM (UTC)
 */
class AttendanceCleanupJob {
    static start() {
        console.log('🚀 Starting Attendance Cleanup Job scheduler...');

        // Chạy hằng ngày lúc 2:00 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('🧹 [CRON] Bắt đầu cleanup rawData attendance cũ...');

                const startTime = Date.now();
                const result = await TimeAttendance.cleanupAllOldRawData();
                const endTime = Date.now();

                console.log(`✅ [CRON] Cleanup hoàn thành trong ${endTime - startTime}ms:`);
                console.log(`   - Modified records: ${result.modifiedCount}`);
                console.log(`   - Timestamp: ${new Date().toISOString()}`);

            } catch (error) {
                console.error('❌ [CRON] Lỗi khi cleanup rawData:', error);
            }
        }, {
            timezone: "Asia/Ho_Chi_Minh" // VN timezone
        });

        console.log('✅ Attendance Cleanup Job đã được khởi động (chạy hằng ngày 2:00 AM)');
    }

    // Method để chạy cleanup thủ công (cho testing)
    static async runManual() {
        try {
            console.log('🧹 [MANUAL] Bắt đầu cleanup rawData attendance...');

            const startTime = Date.now();
            const result = await TimeAttendance.cleanupAllOldRawData();
            const endTime = Date.now();

            console.log(`✅ [MANUAL] Cleanup hoàn thành trong ${endTime - startTime}ms:`);
            console.log(`   - Modified records: ${result.modifiedCount}`);

            return result;
        } catch (error) {
            console.error('❌ [MANUAL] Lỗi khi cleanup rawData:', error);
            throw error;
        }
    }
}

module.exports = AttendanceCleanupJob; 