// services/emailNotificationService.js
// Service gửi email thông báo trực tiếp qua Microsoft Graph API

const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');

/**
 * Service để gửi email thông báo trực tiếp qua Microsoft Graph API
 * Sử dụng cùng credentials với microsoftSyncService
 */
class EmailNotificationService {
  constructor() {
    this.graphClient = null;
    this.isInitialized = false;
    
    // Email người gửi (dùng chung với Ticket system)
    this.senderEmail = process.env.EMAIL_USER;
    
    // Danh sách email nhận thông báo khi có CV mới (phân cách bởi dấu phẩy)
    this.recruitmentNotifyEmails = (process.env.RECRUITMENT_NOTIFY_EMAILS || '')
      .split(',')
      .map(email => email.trim())
      .filter(email => email);
    
    console.log('[EmailNotification] Sender email:', this.senderEmail);
    console.log('[EmailNotification] Notify emails:', this.recruitmentNotifyEmails);
  }

  /**
   * Khởi tạo Microsoft Graph Client
   * Sử dụng credentials của Ticket system (TENANTTICKET_ID, CLIENTTICKET_ID, CLIENTTICKET_SECRET)
   */
  async initialize() {
    try {
      const tenantId = process.env.TENANTTICKET_ID;
      const clientId = process.env.CLIENTTICKET_ID;
      const clientSecret = process.env.CLIENTTICKET_SECRET;

      if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Microsoft 365 credentials not configured (TENANTTICKET_ID, CLIENTTICKET_ID, CLIENTTICKET_SECRET)');
      }

      if (!this.senderEmail) {
        throw new Error('Email sender not configured (EMAIL_USER)');
      }

      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      
      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          }
        }
      });

      this.isInitialized = true;
      console.log('[EmailNotification] Microsoft Graph Client initialized successfully');
    } catch (error) {
      console.error('[EmailNotification] Failed to initialize:', error.message);
      throw error;
    }
  }

  /**
   * Gửi email thông qua Microsoft Graph API
   * @param {Object} emailData - Dữ liệu email
   * @param {string[]} emailData.to - Danh sách email người nhận
   * @param {string} emailData.subject - Tiêu đề email
   * @param {string} emailData.body - Nội dung email (HTML)
   * @returns {Promise<Object>} - Kết quả gửi email
   */
  async sendEmail(emailData) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!emailData.to || emailData.to.length === 0) {
        return { success: false, message: 'No recipients specified' };
      }

      const message = {
        subject: emailData.subject,
        body: {
          contentType: emailData.contentType || 'HTML',
          content: emailData.body
        },
        toRecipients: emailData.to.map(email => ({
          emailAddress: { address: email }
        }))
      };

      const sendMail = {
        message: message,
        saveToSentItems: true
      };

      await this.graphClient
        .api(`/users/${this.senderEmail}/sendMail`)
        .post(sendMail);

      console.log(`[EmailNotification] Email sent successfully: ${emailData.subject}`);
      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      console.error('[EmailNotification] Error sending email:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Gửi thông báo khi có CV mới ứng tuyển vào công việc cụ thể
   * @param {Object} application - Thông tin ứng viên
   * @param {Object} job - Thông tin công việc
   */
  async notifyNewJobApplication(application, job) {
    if (this.recruitmentNotifyEmails.length === 0) {
      console.log('[EmailNotification] No notify emails configured, skipping notification');
      return { success: false, message: 'No notify emails configured' };
    }

    const subject = `[Tuyển dụng] CV mới ứng tuyển: ${job?.title || 'Vị trí chưa xác định'}`;
    
    const body = this.buildNewApplicationEmailBody({
      fullname: application.fullname,
      email: application.email,
      phone: application.phone,
      birthdate: application.birthdate,
      highestDegree: application.highestDegree,
      englishLevel: application.englishLevel,
      expectedSalary: application.expectedSalary,
      graduationSchools: application.graduationSchools,
      jobTitle: job?.title || 'N/A',
      applicationType: 'Công việc cụ thể',
      createdAt: new Date().toLocaleString('vi-VN')
    });

    return await this.sendEmail({
      to: this.recruitmentNotifyEmails,
      subject,
      body
    });
  }

  /**
   * Gửi thông báo khi có CV mới ứng tuyển vào vị trí mở
   * @param {Object} application - Thông tin ứng viên
   */
  async notifyNewOpenPositionApplication(application) {
    if (this.recruitmentNotifyEmails.length === 0) {
      console.log('[EmailNotification] No notify emails configured, skipping notification');
      return { success: false, message: 'No notify emails configured' };
    }

    const subject = `[Tuyển dụng] CV mới ứng tuyển vị trí mở: ${application.openPositionTitle}`;
    
    const body = this.buildNewApplicationEmailBody({
      fullname: application.fullname,
      email: application.email,
      phone: application.phone,
      birthdate: application.birthdate,
      highestDegree: application.highestDegree,
      englishLevel: application.englishLevel,
      expectedSalary: application.expectedSalary,
      graduationSchools: application.graduationSchools,
      jobTitle: application.openPositionTitle,
      applicationType: `Vị trí mở (${application.openPositionType || 'Chưa xác định'})`,
      createdAt: new Date().toLocaleString('vi-VN')
    });

    return await this.sendEmail({
      to: this.recruitmentNotifyEmails,
      subject,
      body
    });
  }

  /**
   * Tạo nội dung email thông báo CV mới
   * @param {Object} data - Dữ liệu ứng viên
   */
  buildNewApplicationEmailBody(data) {
    // Format trường học
    let schoolsHtml = 'Chưa cung cấp';
    if (data.graduationSchools && data.graduationSchools.length > 0) {
      schoolsHtml = data.graduationSchools.map(school => 
        `<li><strong>${school.schoolName}</strong> - ${school.major}</li>`
      ).join('');
      schoolsHtml = `<ul style="margin: 0; padding-left: 20px;">${schoolsHtml}</ul>`;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #002147 0%, #003366 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; }
          .info-table { width: 100%; border-collapse: collapse; }
          .info-table td { padding: 10px 0; border-bottom: 1px solid #eee; }
          .info-table td:first-child { font-weight: 600; color: #002147; width: 40%; }
          .footer { background: #f0f0f0; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #666; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          .badge-job { background: #e3f2fd; color: #1565c0; }
          .badge-open { background: #e8f5e9; color: #2e7d32; }
          .highlight { color: #FF5733; font-weight: 600; }
          .btn { display: inline-block; padding: 12px 24px; background: #FF5733; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">📋 CV Mới Ứng Tuyển</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Wellspring Recruitment System</p>
          </div>
          
          <div class="content">
            <p>Xin chào,</p>
            <p>Hệ thống vừa nhận được một đơn ứng tuyển mới với thông tin như sau:</p>
            
            <table class="info-table">
              <tr>
                <td>👤 Họ tên:</td>
                <td><strong>${data.fullname}</strong></td>
              </tr>
              <tr>
                <td>📧 Email:</td>
                <td><a href="mailto:${data.email}">${data.email}</a></td>
              </tr>
              <tr>
                <td>📱 Số điện thoại:</td>
                <td>${data.phone}</td>
              </tr>
              <tr>
                <td>🎂 Ngày sinh:</td>
                <td>${data.birthdate ? new Date(data.birthdate).toLocaleDateString('vi-VN') : 'Chưa cung cấp'}</td>
              </tr>
              <tr>
                <td>🎓 Trình độ cao nhất:</td>
                <td>${data.highestDegree || 'Chưa cung cấp'}</td>
              </tr>
              <tr>
                <td>🌐 Trình độ tiếng Anh:</td>
                <td>${data.englishLevel || 'Chưa cung cấp'}</td>
              </tr>
              <tr>
                <td>💰 Mức lương mong muốn:</td>
                <td class="highlight">${data.expectedSalary || 'Chưa cung cấp'}</td>
              </tr>
              <tr>
                <td>🏫 Trường đã tốt nghiệp:</td>
                <td>${schoolsHtml}</td>
              </tr>
              <tr>
                <td>💼 Vị trí ứng tuyển:</td>
                <td><strong>${data.jobTitle}</strong></td>
              </tr>
              <tr>
                <td>📌 Loại ứng tuyển:</td>
                <td><span class="badge ${data.applicationType.includes('Công việc') ? 'badge-job' : 'badge-open'}">${data.applicationType}</span></td>
              </tr>
              <tr>
                <td>🕐 Thời gian nộp:</td>
                <td>${data.createdAt}</td>
              </tr>
            </table>
            
            <p style="text-align: center; margin-top: 20px;">
              <a href="https://career.wellspring.edu.vn/admin" class="btn">Xem chi tiết trong hệ thống</a>
            </p>
          </div>
          
          <div class="footer">
            <p>Email này được gửi tự động từ Wellspring Recruitment System.</p>
            <p>© ${new Date().getFullYear()} Wellspring International School</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailNotificationService();
