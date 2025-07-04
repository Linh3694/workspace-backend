const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const MicrosoftUser = require('../models/MicrosoftUser');
const User = require('../models/Users');
const logger = require('../logger');

class MicrosoftSyncService {
  constructor() {
    this.graphClient = null;
    this.isInitialized = false;
  }

  // Khởi tạo Microsoft Graph Client
  async initialize() {
    try {
      const tenantId = process.env.MICROSOFT_TENANT_ID;
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

      if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Microsoft 365 credentials not configured');
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
      logger.info('Microsoft Graph Client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Microsoft Graph Client:', error);
      throw error;
    }
  }

  // Lấy danh sách users từ Microsoft Graph API
  async fetchMicrosoftUsers() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const users = [];
      let nextLink = null;
      let page = 1;

      do {
        const query = nextLink || '/users?$select=id,displayName,givenName,surname,userPrincipalName,mail,jobTitle,department,officeLocation,businessPhones,mobilePhone,employeeId,employeeType,accountEnabled,preferredLanguage,usageLocation&$top=100';
        
        const response = await this.graphClient.api(query).get();
        
        if (response.value) {
          users.push(...response.value);
        }
        
        nextLink = response['@odata.nextLink'];
        page++;
        
        logger.info(`Fetched page ${page - 1} with ${response.value?.length || 0} users`);
      } while (nextLink);

      logger.info(`Total Microsoft users fetched: ${users.length}`);
      return users;
    } catch (error) {
      logger.error('Error fetching Microsoft users:', error);
      throw error;
    }
  }

  // Đồng bộ một user từ Microsoft
  async syncMicrosoftUser(microsoftUserData) {
    try {
      const {
        id,
        displayName,
        givenName,
        surname,
        userPrincipalName,
        mail,
        jobTitle,
        department,
        officeLocation,
        businessPhones,
        mobilePhone,
        employeeId,
        employeeType,
        accountEnabled,
        preferredLanguage,
        usageLocation
      } = microsoftUserData;

      // Tìm hoặc tạo MicrosoftUser record
      let microsoftUser = await MicrosoftUser.findByMicrosoftId(id);
      
      if (!microsoftUser) {
        microsoftUser = new MicrosoftUser({
          id,
          displayName,
          givenName,
          surname,
          userPrincipalName,
          mail,
          jobTitle,
          department,
          officeLocation,
          businessPhones,
          mobilePhone,
          employeeId,
          employeeType,
          accountEnabled,
          preferredLanguage,
          usageLocation
        });
      } else {
        // Cập nhật thông tin
        Object.assign(microsoftUser, {
          displayName,
          givenName,
          surname,
          userPrincipalName,
          mail,
          jobTitle,
          department,
          officeLocation,
          businessPhones,
          mobilePhone,
          employeeId,
          employeeType,
          accountEnabled,
          preferredLanguage,
          usageLocation
        });
      }

      microsoftUser.lastSyncAt = new Date();
      await microsoftUser.save();

      // Tìm user local tương ứng
      let localUser = null;
      
      // Tìm theo Microsoft ID
      if (microsoftUser.mappedUserId) {
        localUser = await User.findById(microsoftUser.mappedUserId);
      }
      
      // Tìm theo email nếu chưa có mapping
      if (!localUser && mail) {
        localUser = await User.findOne({ email: mail });
      }
      
      // Tìm theo userPrincipalName
      if (!localUser && userPrincipalName) {
        localUser = await User.findOne({ email: userPrincipalName });
      }

      // Tạo user local nếu chưa tồn tại
      if (!localUser) {
        localUser = await this.createLocalUser(microsoftUser);
      } else {
        // Cập nhật thông tin user local
        await this.updateLocalUser(localUser, microsoftUser);
      }

      // Cập nhật mapping
      if (localUser && !microsoftUser.mappedUserId) {
        microsoftUser.mappedUserId = localUser._id;
        microsoftUser.syncStatus = 'synced';
        await microsoftUser.save();
      }

      return { microsoftUser, localUser };
    } catch (error) {
      logger.error(`Error syncing Microsoft user ${microsoftUserData.id}:`, error);
      
      // Cập nhật trạng thái lỗi
      if (microsoftUser) {
        await microsoftUser.markSyncFailed(error.message);
      }
      
      throw error;
    }
  }

  // Tạo user local từ Microsoft user
  async createLocalUser(microsoftUser) {
    try {
      const userData = {
        email: microsoftUser.mail || microsoftUser.userPrincipalName,
        fullname: microsoftUser.displayName,
        jobTitle: microsoftUser.jobTitle || 'User',
        department: microsoftUser.department || 'Unknown',
        role: this.mapMicrosoftRoleToLocalRole(microsoftUser.jobTitle, microsoftUser.department),
        active: microsoftUser.accountEnabled,
        provider: 'microsoft',
        microsoftId: microsoftUser.id,
        avatarUrl: '' // Có thể lấy từ Microsoft Graph API sau
      };

      const localUser = new User(userData);
      await localUser.save();
      
      logger.info(`Created local user: ${localUser.email}`);
      return localUser;
    } catch (error) {
      logger.error(`Error creating local user for ${microsoftUser.id}:`, error);
      throw error;
    }
  }

  // Cập nhật user local từ Microsoft user
  async updateLocalUser(localUser, microsoftUser) {
    try {
      const updates = {
        fullname: microsoftUser.displayName,
        jobTitle: microsoftUser.jobTitle || localUser.jobTitle,
        department: microsoftUser.department || localUser.department,
        role: this.mapMicrosoftRoleToLocalRole(microsoftUser.jobTitle, microsoftUser.department) || localUser.role,
        active: microsoftUser.accountEnabled,
        microsoftId: microsoftUser.id
      };

      Object.assign(localUser, updates);
      await localUser.save();
      
      logger.info(`Updated local user: ${localUser.email}`);
      return localUser;
    } catch (error) {
      logger.error(`Error updating local user ${localUser.email}:`, error);
      throw error;
    }
  }

  // Map role từ Microsoft sang local role
  mapMicrosoftRoleToLocalRole(jobTitle, department) {
    if (!jobTitle && !department) return 'user';

    const title = (jobTitle || '').toLowerCase();
    const dept = (department || '').toLowerCase();

    // Mapping logic dựa trên job title và department
    if (title.includes('admin') || title.includes('administrator')) return 'admin';
    if (title.includes('teacher') || title.includes('giáo viên')) return 'teacher';
    if (title.includes('principal') || title.includes('hiệu trưởng')) return 'principal';
    if (title.includes('librarian') || title.includes('thủ thư')) return 'librarian';
    if (title.includes('hr') || dept.includes('human resource')) return 'hr';
    if (title.includes('technical') || title.includes('it')) return 'technical';
    if (title.includes('marcom') || dept.includes('marketing')) return 'marcom';
    if (title.includes('bod') || title.includes('board')) return 'bod';
    if (title.includes('service')) return 'service';
    if (title.includes('registrar')) return 'registrar';
    if (title.includes('admission')) return 'admission';
    if (title.includes('bos')) return 'bos';

    return 'user';
  }

  // Đồng bộ toàn bộ users
  async syncAllUsers() {
    try {
      logger.info('Starting Microsoft 365 user sync...');
      
      const microsoftUsers = await this.fetchMicrosoftUsers();
      const results = {
        total: microsoftUsers.length,
        synced: 0,
        failed: 0,
        errors: []
      };

      for (const microsoftUserData of microsoftUsers) {
        try {
          await this.syncMicrosoftUser(microsoftUserData);
          results.synced++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: microsoftUserData.id,
            error: error.message
          });
        }
      }

      logger.info(`Microsoft sync completed. Synced: ${results.synced}, Failed: ${results.failed}`);
      return results;
    } catch (error) {
      logger.error('Error in syncAllUsers:', error);
      throw error;
    }
  }

  // Đồng bộ một user cụ thể
  async syncUserById(microsoftId) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const userData = await this.graphClient.api(`/users/${microsoftId}`)
        .select('id,displayName,givenName,surname,userPrincipalName,mail,jobTitle,department,officeLocation,businessPhones,mobilePhone,employeeId,employeeType,accountEnabled,preferredLanguage,usageLocation')
        .get();

      return await this.syncMicrosoftUser(userData);
    } catch (error) {
      logger.error(`Error syncing user ${microsoftId}:`, error);
      throw error;
    }
  }

  // Lấy thống kê đồng bộ
  async getSyncStats() {
    try {
      const stats = await MicrosoftUser.aggregate([
        {
          $group: {
            _id: '$syncStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      const totalUsers = await MicrosoftUser.countDocuments();
      const mappedUsers = await MicrosoftUser.countDocuments({ mappedUserId: { $exists: true, $ne: null } });

      return {
        total: totalUsers,
        mapped: mappedUsers,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Error getting sync stats:', error);
      throw error;
    }
  }
}

module.exports = new MicrosoftSyncService(); 