const express = require('express');
const router = express.Router();
const leaveRequestController = require('../../controllers/SIS/leaveRequestController');

// Define routes for Leave Requests

// GET /api/leave-requests - Get all leave requests with filters
router.get('/', leaveRequestController.getLeaveRequests);

// GET /api/leave-requests/parent/:parentId - Get leave requests by parent
router.get('/parent/:parentId', leaveRequestController.getLeaveRequestsByParent);

// GET /api/leave-requests/student/:studentId - Get leave requests by student
router.get('/student/:studentId', leaveRequestController.getLeaveRequestsByStudent);

// GET /api/leave-requests/:id - Get single leave request by ID
router.get('/:id', leaveRequestController.getLeaveRequestById);

// POST /api/leave-requests - Create new leave request
router.post('/', leaveRequestController.createLeaveRequest);

// PUT /api/leave-requests/:id - Update leave request
router.put('/:id', leaveRequestController.updateLeaveRequest);

// DELETE /api/leave-requests/:id - Delete leave request
router.delete('/:id', leaveRequestController.deleteLeaveRequest);

// POST /api/leave-requests/:id/approve - Approve leave request
router.post('/:id/approve', leaveRequestController.approveLeaveRequest);

// POST /api/leave-requests/:id/reject - Reject leave request
router.post('/:id/reject', leaveRequestController.rejectLeaveRequest);

// POST /api/leave-requests/:id/attachments - Upload attachments
router.post('/:id/attachments', leaveRequestController.uploadAttachments);

module.exports = router; 