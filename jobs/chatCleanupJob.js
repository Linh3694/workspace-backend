const cron = require('node-cron');
const { autoCleanupEmptyChats } = require('../controllers/Chat/chatController');

/**
 * Scheduled Job để cleanup chat rỗng
 * - Chat 1-1 rỗng quá 1 giờ
 * - Group chat rỗng quá 7 ngày
 * Chạy mỗi 12 giờ (2 lần/ngày)
 */
class ChatCleanupJob {
    static start() {
        // Chạy mỗi 12 giờ (00:00, 12:00)
        cron.schedule('0 */12 * * *', async () => {
            try {
                const result = await autoCleanupEmptyChats();
                
                if (result.error) {
                    console.error(`❌ [CRON] Lỗi cleanup chat: ${result.error}`);
                    return;
                }
            } catch (error) {
                console.error('❌ [CRON] Lỗi trong chat cleanup job:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Ho_Chi_Minh"
        });
    }

    static async runManual() {
        try {
            const result = await autoCleanupEmptyChats();
            
            if (result.error) {
                console.error(`❌ [MANUAL] Lỗi cleanup chat: ${result.error}`);
                return result;
            }
            
            return result;
        } catch (error) {
            console.error('❌ [MANUAL] Lỗi trong manual cleanup:', error);
            return { error: error.message };
        }
    }
}

module.exports = ChatCleanupJob; 