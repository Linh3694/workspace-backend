const cron = require('node-cron');
const microsoftSyncService = require('../services/microsoftSyncService');

class MicrosoftSyncJob {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  // Khởi tạo job đồng bộ hàng ngày lúc 2:00 AM
  initDailySync() {
    // Chạy mỗi ngày lúc 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      await this.runDailySync();
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    console.info('Microsoft sync job scheduled for daily at 2:00 AM');
  }

  // Khởi tạo job đồng bộ hàng giờ (tùy chọn)
  initHourlySync() {
    // Chạy mỗi giờ
    cron.schedule('0 * * * *', async () => {
      await this.runHourlySync();
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    console.info('Microsoft sync job scheduled for hourly');
  }

  // Chạy đồng bộ hàng ngày
  async runDailySync() {
    if (this.isRunning) {
      console.info('Microsoft sync job is already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      this.lastRun = new Date();
      
      console.info('Starting daily Microsoft sync job...');
      
      const results = await microsoftSyncService.syncAllUsers();
      
      console.info(`Daily Microsoft sync completed. Synced: ${results.synced}, Failed: ${results.failed}`);
      
      // Log chi tiết lỗi nếu có
      if (results.errors && results.errors.length > 0) {
        console.error('Microsoft sync errors:', results.errors);
      }
      
    } catch (error) {
      console.error('Error in daily Microsoft sync job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Chạy đồng bộ hàng giờ (chỉ sync những user có thay đổi)
  async runHourlySync() {
    if (this.isRunning) {
      console.info('Microsoft sync job is already running, skipping hourly sync...');
      return;
    }

    try {
      this.isRunning = true;
      this.lastRun = new Date();
      
      console.info('Starting hourly Microsoft sync job...');
      
      // Chỉ sync những user được cập nhật trong 24h qua
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const results = await microsoftSyncService.syncAllUsers();
      
      console.info(`Hourly Microsoft sync completed. Synced: ${results.synced}, Failed: ${results.failed}`);
      
    } catch (error) {
      console.error('Error in hourly Microsoft sync job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Chạy đồng bộ thủ công
  async runManualSync() {
    if (this.isRunning) {
      throw new Error('Microsoft sync job is already running');
    }

    try {
      this.isRunning = true;
      this.lastRun = new Date();
      
      console.info('Starting manual Microsoft sync...');
      
      const results = await microsoftSyncService.syncAllUsers();
      
      console.info(`Manual Microsoft sync completed. Synced: ${results.synced}, Failed: ${results.failed}`);
      
      return results;
    } catch (error) {
      console.error('Error in manual Microsoft sync:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Lấy trạng thái job
  getJobStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun
    };
  }

  // Dừng job
  stop() {
    // Dừng tất cả cron jobs
    cron.getTasks().forEach(task => {
      if (task.name && task.name.includes('microsoft')) {
        task.stop();
      }
    });
    
    console.info('Microsoft sync jobs stopped');
  }
}

// Tạo instance singleton
const microsoftSyncJob = new MicrosoftSyncJob();

// Khởi tạo jobs khi module được load
if (process.env.NODE_ENV !== 'test') {
  microsoftSyncJob.initDailySync();
  
  // Chỉ chạy hourly sync nếu được cấu hình
  if (process.env.MICROSOFT_HOURLY_SYNC === 'true') {
    microsoftSyncJob.initHourlySync();
  }
}

module.exports = microsoftSyncJob; 