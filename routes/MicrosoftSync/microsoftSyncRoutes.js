const express = require('express');
const router = express.Router();
const {
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
} = require('../../controllers/MicrosoftSync/microsoftSyncController');

// Middleware để kiểm tra quyền admin
const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền truy cập'
    });
  }
  next();
};

// Routes cho Microsoft Sync
// POST /api/microsoft-sync/sync-all - Đồng bộ toàn bộ users
router.post('/sync-all', requireAdmin, syncAllUsers);

// POST /api/microsoft-sync/sync-user/:microsoftId - Đồng bộ một user cụ thể
router.post('/sync-user/:microsoftId', requireAdmin, syncUserById);

// GET /api/microsoft-sync/stats - Lấy thống kê đồng bộ
router.get('/stats', requireAdmin, getSyncStats);

// GET /api/microsoft-sync/users - Lấy danh sách Microsoft users
router.get('/users', requireAdmin, getMicrosoftUsers);

// GET /api/microsoft-sync/users/:id - Lấy chi tiết Microsoft user
router.get('/users/:id', requireAdmin, getMicrosoftUserById);

// POST /api/microsoft-sync/users/:id/map - Map Microsoft user với local user
router.post('/users/:id/map', requireAdmin, mapMicrosoftUser);

// DELETE /api/microsoft-sync/users/:id/map - Xóa mapping Microsoft user
router.delete('/users/:id/map', requireAdmin, unmapMicrosoftUser);

// POST /api/microsoft-sync/users/:id/retry - Retry sync cho user bị lỗi
router.post('/users/:id/retry', requireAdmin, retrySyncUser);

// GET /api/microsoft-sync/unmapped-users - Lấy danh sách local users chưa được map
router.get('/unmapped-users', requireAdmin, getUnmappedLocalUsers);

// GET /api/microsoft-sync/job-status - Lấy trạng thái job đồng bộ
router.get('/job-status', requireAdmin, getJobStatus);

// POST /api/microsoft-sync/run-job - Chạy đồng bộ thủ công qua job
router.post('/run-job', requireAdmin, runManualJob);

module.exports = router; 