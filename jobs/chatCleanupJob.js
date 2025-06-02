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
        console.log('🚀 Starting Chat Cleanup Job scheduler...');

        // Chạy mỗi 12 giờ (00:00, 12:00)
        cron.schedule('0 */12 * * *', async () => {
            try {
                console.log('🧹 [CRON] Bắt đầu cleanup chat rỗng...');

                const startTime = Date.now();
                const result = await autoCleanupEmptyChats();
                const endTime = Date.now();

                if (result.error) {
                    console.error(`❌ [CRON] Lỗi cleanup chat: ${result.error}`);
                    return;
                }

                const duration = ((endTime - startTime) / 1000).toFixed(2);
                
                if (result.deletedCount > 0) {
                    console.log(`✅ [CRON] Cleanup hoàn thành trong ${duration}s:`, {
                        chatDeleted: result.deletedCount,
                        oneToOneChats: result.oneToOneChats,
                        groupChats: result.groupChats,
                        affectedUsers: result.affectedUsers
                    });
                } else {
                    console.log(`✅ [CRON] Cleanup hoàn thành trong ${duration}s - Không có chat rỗng nào cần xóa`);
                }
            } catch (error) {
                console.error('❌ [CRON] Lỗi trong chat cleanup job:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Ho_Chi_Minh"
        });

        console.log('✅ Chat Cleanup Job đã được lên lịch chạy mỗi 12 giờ');
    }

    static async runManual() {
        try {
            console.log('🧹 [MANUAL] Bắt đầu manual cleanup chat rỗng...');
            
            const startTime = Date.now();
            const result = await autoCleanupEmptyChats();
            const endTime = Date.now();
            
            if (result.error) {
                console.error(`❌ [MANUAL] Lỗi cleanup chat: ${result.error}`);
                return result;
            }
            
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            console.log(`✅ [MANUAL] Cleanup hoàn thành trong ${duration}s:`, {
                deletedCount: result.deletedCount,
                oneToOneChats: result.oneToOneChats,
                groupChats: result.groupChats,
                affectedUsers: result.affectedUsers
            });
            
            return result;
        } catch (error) {
            console.error('❌ [MANUAL] Lỗi trong manual cleanup:', error);
            return { error: error.message };
        }
    }
}

module.exports = ChatCleanupJob; 