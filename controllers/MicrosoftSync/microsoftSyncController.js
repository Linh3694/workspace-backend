const microsoftSyncService = require('../../services/microsoftSyncService');
const MicrosoftUser = require('../../models/MicrosoftUser');
const User = require('../../models/Users');
const microsoftSyncJob = require('../../jobs/microsoftSyncJob');
const  = require('../../');

// @desc    Đồng bộ toàn bộ users từ Microsoft 365
// @route   POST /api/microsoft-sync/sync-all
// @access  Private (Admin only)
const syncAllUsers = async (req, res) => {
  try {
    .info('Manual sync all users requested');
    
    const results = await microsoftSyncService.syncAllUsers();
    
    res.status(200).json({
      success: true,
      message: 'Đồng bộ thành công',
      data: results
    });
  } catch (error) {
    .error('Error in syncAllUsers controller:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi đồng bộ users',
      error: error.message
    });
  }
};

// @desc    Đồng bộ một user cụ thể từ Microsoft 365
// @route   POST /api/microsoft-sync/sync-user/:microsoftId
// @access  Private (Admin only)
const syncUserById = async (req, res) => {
  try {
    const { microsoftId } = req.params;
    
    if (!microsoftId) {
      return res.status(400).json({
        success: false,
        message: 'Microsoft ID là bắt buộc'
      });
    }

    .info(`Manual sync user requested: ${microsoftId}`);
    
    const result = await microsoftSyncService.syncUserById(microsoftId);
    
    res.status(200).json({
      success: true,
      message: 'Đồng bộ user thành công',
      data: result
    });
  } catch (error) {
    .error(`Error in syncUserById controller for ${req.params.microsoftId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi đồng bộ user',
      error: error.message
    });
  }
};

// @desc    Lấy thống kê đồng bộ
// @route   GET /api/microsoft-sync/stats
// @access  Private (Admin only)
const getSyncStats = async (req, res) => {
  try {
    const stats = await microsoftSyncService.getSyncStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    .error('Error in getSyncStats controller:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê đồng bộ',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách Microsoft users
// @route   GET /api/microsoft-sync/users
// @access  Private (Admin only)
const getMicrosoftUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    const query = {};
    
    if (status) {
      query.syncStatus = status;
    }
    
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { userPrincipalName: { $regex: search, $options: 'i' } },
        { mail: { $regex: search, $options: 'i' } },
        { jobTitle: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { lastSyncAt: -1 },
      populate: {
        path: 'mappedUserId',
        select: 'email fullname role active'
      }
    };

    const result = await MicrosoftUser.paginate(query, options);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    .error('Error in getMicrosoftUsers controller:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách Microsoft users',
      error: error.message
    });
  }
};

// @desc    Lấy chi tiết Microsoft user
// @route   GET /api/microsoft-sync/users/:id
// @access  Private (Admin only)
const getMicrosoftUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const microsoftUser = await MicrosoftUser.findById(id)
      .populate('mappedUserId', 'email fullname role active jobTitle department');
    
    if (!microsoftUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy Microsoft user'
      });
    }
    
    res.status(200).json({
      success: true,
      data: microsoftUser
    });
  } catch (error) {
    .error(`Error in getMicrosoftUserById controller for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy chi tiết Microsoft user',
      error: error.message
    });
  }
};

// @desc    Map Microsoft user với local user
// @route   POST /api/microsoft-sync/users/:id/map
// @access  Private (Admin only)
const mapMicrosoftUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { localUserId } = req.body;
    
    if (!localUserId) {
      return res.status(400).json({
        success: false,
        message: 'Local User ID là bắt buộc'
      });
    }

    const microsoftUser = await MicrosoftUser.findById(id);
    if (!microsoftUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy Microsoft user'
      });
    }

    const localUser = await User.findById(localUserId);
    if (!localUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy local user'
      });
    }

    await microsoftUser.mapToLocalUser(localUserId);
    
    res.status(200).json({
      success: true,
      message: 'Map user thành công',
      data: {
        microsoftUser,
        localUser
      }
    });
  } catch (error) {
    .error(`Error in mapMicrosoftUser controller for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi map user',
      error: error.message
    });
  }
};

// @desc    Xóa mapping Microsoft user
// @route   DELETE /api/microsoft-sync/users/:id/map
// @access  Private (Admin only)
const unmapMicrosoftUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const microsoftUser = await MicrosoftUser.findById(id);
    if (!microsoftUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy Microsoft user'
      });
    }

    microsoftUser.mappedUserId = null;
    microsoftUser.syncStatus = 'pending';
    await microsoftUser.save();
    
    res.status(200).json({
      success: true,
      message: 'Xóa mapping thành công'
    });
  } catch (error) {
    .error(`Error in unmapMicrosoftUser controller for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa mapping',
      error: error.message
    });
  }
};

// @desc    Retry sync cho user bị lỗi
// @route   POST /api/microsoft-sync/users/:id/retry
// @access  Private (Admin only)
const retrySyncUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const microsoftUser = await MicrosoftUser.findById(id);
    if (!microsoftUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy Microsoft user'
      });
    }

    if (microsoftUser.syncStatus !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể retry cho user có trạng thái failed'
      });
    }

    const result = await microsoftSyncService.syncUserById(microsoftUser.id);
    
    res.status(200).json({
      success: true,
      message: 'Retry sync thành công',
      data: result
    });
  } catch (error) {
    .error(`Error in retrySyncUser controller for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi retry sync',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách local users chưa được map
// @route   GET /api/microsoft-sync/unmapped-users
// @access  Private (Admin only)
const getUnmappedLocalUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    const query = {
      provider: { $ne: 'microsoft' },
      active: true
    };
    
    if (search) {
      query.$or = [
        { fullname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { jobTitle: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: 'email fullname role jobTitle department active'
    };

    const result = await User.paginate(query, options);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    .error('Error in getUnmappedLocalUsers controller:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách unmapped users',
      error: error.message
    });
  }
};

// @desc    Lấy trạng thái job đồng bộ
// @route   GET /api/microsoft-sync/job-status
// @access  Private (Admin only)
const getJobStatus = async (req, res) => {
  try {
    const jobStatus = microsoftSyncJob.getJobStatus();
    
    res.status(200).json({
      success: true,
      data: jobStatus
    });
  } catch (error) {
    .error('Error in getJobStatus controller:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy trạng thái job',
      error: error.message
    });
  }
};

// @desc    Chạy đồng bộ thủ công qua job
// @route   POST /api/microsoft-sync/run-job
// @access  Private (Admin only)
const runManualJob = async (req, res) => {
  try {
    .info('Manual job sync requested');
    
    const results = await microsoftSyncJob.runManualSync();
    
    res.status(200).json({
      success: true,
      message: 'Job đồng bộ thành công',
      data: results
    });
  } catch (error) {
    .error('Error in runManualJob controller:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi chạy job đồng bộ',
      error: error.message
    });
  }
};

module.exports = {
  syncAllUsers,
  syncUserById,
  getSyncStats,
  getMicrosoftUsers,
  getMicrosoftUserById,
  mapMicrosoftUser,
  unmapMicrosoftUser,
  retrySyncUser,
  getUnmappedLocalUsers,
  getJobStatus,
  runManualJob
}; 