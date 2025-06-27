const cron = require('node-cron');
const TimeAttendance = require('../models/TimeAttendance');

/**
 * Scheduled Job để cleanup rawData cũ hơn 7 ngày
 * Chạy hằng ngày lúc 2:00 AM (UTC)
 */
class AttendanceCleanupJob {
    static start() {
        // Chạy hằng ngày lúc 2:00 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                const startTime = Date.now();
                const result = await TimeAttendance.cleanupAllOldRawData();
                const endTime = Date.now();
            } catch (error) {
                console.error('❌ [CRON] Lỗi khi cleanup rawData:', error);
            }
        }, {
            timezone: "Asia/Ho_Chi_Minh" // VN timezone
        });

    }

    // Method để chạy cleanup thủ công (cho testing)
    static async runManual() {
        try {

            const startTime = Date.now();
            const result = await TimeAttendance.cleanupAllOldRawData();
            const endTime = Date.now();
            return result;
        } catch (error) {
            console.error('❌ [MANUAL] Lỗi khi cleanup rawData:', error);
            throw error;
        }
    }
}

module.exports = AttendanceCleanupJob; 