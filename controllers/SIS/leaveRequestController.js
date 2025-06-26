const asyncHandler = require('express-async-handler');
const LeaveRequest = require('../../models/LeaveRequest');
const Student = require('../../models/Student');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cấu hình multer cho upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = './uploads/leave-requests/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload file ảnh, PDF, hoặc document!'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

// Display list of all Leave Requests
exports.getLeaveRequests = asyncHandler(async (req, res) => {
  const { 
    student, 
    status, 
    reason, 
    startDate, 
    endDate, 
    createdBy,
    page = 1, 
    limit = 10 
  } = req.query;

  let filter = {};
  
  if (student) filter.student = student;
  if (status) filter.status = status;
  if (reason) filter.reason = reason;
  if (createdBy) filter.createdBy = createdBy;
  
  // Date range filter - filter by leave date range
  if (startDate && endDate) {
    // Convert to start and end of day to handle timezone issues
    const queryStartDate = new Date(startDate);
    const queryEndDate = new Date(endDate);
    queryEndDate.setHours(23, 59, 59, 999); // End of day
    
    // Check if leave request overlaps with selected date
    filter.$and = [
      { startDate: { $lte: queryEndDate } },
      { endDate: { $gte: queryStartDate } }
    ];
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      { path: 'student', select: 'fullname studentId class _id' },
      { path: 'createdBy', select: 'fullname email phone' },
      { path: 'approvedBy', select: 'fullname' }
    ]
  };

  const leaveRequests = await LeaveRequest.paginate(filter, options);
  res.json(leaveRequests);
});

// Get a single Leave Request by ID
exports.getLeaveRequestById = asyncHandler(async (req, res) => {
  const leaveRequest = await LeaveRequest.findById(req.params.id)
    .populate('student', 'fullname studentId class')
    .populate('createdBy', 'fullname email phone')
    .populate('approvedBy', 'fullname');
    
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Không tìm thấy đơn xin nghỉ phép' });
  }
  
  res.json(leaveRequest);
});

// Create a new Leave Request
exports.createLeaveRequest = asyncHandler(async (req, res) => {
  const {
    student,
    reason,
    description,
    startDate,
    endDate,
    leaveType,
    contactInfo,
    createdBy
  } = req.body;

  // Validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    return res.status(400).json({ 
      message: 'Ngày bắt đầu không thể sau ngày kết thúc' 
    });
  }

  // Check if student exists
  const studentExists = await Student.findById(student);
  if (!studentExists) {
    return res.status(400).json({ message: 'Học sinh không tồn tại' });
  }

  const leaveRequest = new LeaveRequest({
    student,
    reason,
    description,
    startDate: start,
    endDate: end,
    leaveType,
    contactInfo,
    createdBy
  });

  const newLeaveRequest = await leaveRequest.save();
  const populatedRequest = await LeaveRequest.findById(newLeaveRequest._id)
    .populate('student', 'fullname studentId class')
    .populate('createdBy', 'fullname email phone');

  res.status(201).json({
    message: 'Tạo đơn xin nghỉ phép thành công',
    data: populatedRequest
  });
});

// Update a Leave Request
exports.updateLeaveRequest = asyncHandler(async (req, res) => {
  const leaveRequest = await LeaveRequest.findById(req.params.id);
  
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Không tìm thấy đơn xin nghỉ phép' });
  }

  // Chỉ cho phép update khi status là pending
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ 
      message: 'Không thể chỉnh sửa đơn đã được duyệt hoặc từ chối' 
    });
  }

  const updatedLeaveRequest = await LeaveRequest.findByIdAndUpdate(
    req.params.id, 
    req.body, 
    { new: true }
  ).populate('student', 'fullname studentId class')
   .populate('createdBy', 'fullname email phone');

  res.json({
    message: 'Cập nhật đơn xin nghỉ phép thành công',
    data: updatedLeaveRequest
  });
});

// Delete a Leave Request
exports.deleteLeaveRequest = asyncHandler(async (req, res) => {
  const leaveRequest = await LeaveRequest.findById(req.params.id);
  
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Không tìm thấy đơn xin nghỉ phép' });
  }

  // Chỉ cho phép xóa khi status là pending
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ 
      message: 'Không thể xóa đơn đã được duyệt hoặc từ chối' 
    });
  }

  // Delete attachment files if exist
  if (leaveRequest.attachments && leaveRequest.attachments.length > 0) {
    leaveRequest.attachments.forEach(attachment => {
      const filePath = attachment.fileUrl;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }

  await LeaveRequest.findByIdAndDelete(req.params.id);
  
  res.json({ message: 'Xóa đơn xin nghỉ phép thành công' });
});

// Approve a Leave Request
exports.approveLeaveRequest = asyncHandler(async (req, res) => {
  const { approvalNote, approvedBy } = req.body;
  
  const leaveRequest = await LeaveRequest.findById(req.params.id);
  
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Không tìm thấy đơn xin nghỉ phép' });
  }

  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ 
      message: 'Đơn xin nghỉ đã được xử lý trước đó' 
    });
  }

  leaveRequest.status = 'approved';
  leaveRequest.approvalNote = approvalNote;
  leaveRequest.approvedBy = approvedBy;
  leaveRequest.approvedAt = new Date();

  await leaveRequest.save();

  const updatedRequest = await LeaveRequest.findById(req.params.id)
    .populate('student', 'fullname studentId class')
    .populate('createdBy', 'fullname email phone')
    .populate('approvedBy', 'fullname');

  res.json({
    message: 'Duyệt đơn xin nghỉ phép thành công',
    data: updatedRequest
  });
});

// Reject a Leave Request
exports.rejectLeaveRequest = asyncHandler(async (req, res) => {
  const { approvalNote, approvedBy } = req.body;
  
  const leaveRequest = await LeaveRequest.findById(req.params.id);
  
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Không tìm thấy đơn xin nghỉ phép' });
  }

  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ 
      message: 'Đơn xin nghỉ đã được xử lý trước đó' 
    });
  }

  leaveRequest.status = 'rejected';
  leaveRequest.approvalNote = approvalNote;
  leaveRequest.approvedBy = approvedBy;
  leaveRequest.approvedAt = new Date();

  await leaveRequest.save();

  const updatedRequest = await LeaveRequest.findById(req.params.id)
    .populate('student', 'fullname studentId class')
    .populate('createdBy', 'fullname email phone')
    .populate('approvedBy', 'fullname');

  res.json({
    message: 'Từ chối đơn xin nghỉ phép thành công',
    data: updatedRequest
  });
});

// Upload attachments for Leave Request
exports.uploadAttachments = [
  upload.array('attachments', 5), // Max 5 files
  asyncHandler(async (req, res) => {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    
    if (!leaveRequest) {
      return res.status(404).json({ message: 'Không tìm thấy đơn xin nghỉ phép' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Không có file nào được upload' });
    }

    const attachments = req.files.map(file => ({
      fileName: file.originalname,
      fileUrl: file.path,
      fileType: file.mimetype,
      fileSize: file.size
    }));

    leaveRequest.attachments.push(...attachments);
    await leaveRequest.save();

    res.json({
      message: 'Upload file thành công',
      attachments: attachments
    });
  })
];

// Get Leave Requests by Parent
exports.getLeaveRequestsByParent = asyncHandler(async (req, res) => {
  const { parentId } = req.params;
  const { page = 1, limit = 10, status, startDate, endDate } = req.query;

  let filter = { createdBy: parentId };
  if (status) filter.status = status;
  
  // Date range filter - filter by creation date
  if (startDate && endDate) {
    filter.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      { path: 'student', select: 'fullname studentId class' },
      { path: 'approvedBy', select: 'fullname' }
    ]
  };

  const leaveRequests = await LeaveRequest.paginate(filter, options);
  res.json(leaveRequests);
});

// Get Leave Requests by Student
exports.getLeaveRequestsByStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { page = 1, limit = 10, status } = req.query;

  let filter = { student: studentId };
  if (status) filter.status = status;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      { path: 'student', select: 'fullname studentId class' },
      { path: 'createdBy', select: 'fullname email phone' },
      { path: 'approvedBy', select: 'fullname' }
    ]
  };

  const leaveRequests = await LeaveRequest.paginate(filter, options);
  res.json(leaveRequests);
});

module.exports = {
  getLeaveRequests: exports.getLeaveRequests,
  getLeaveRequestById: exports.getLeaveRequestById,
  createLeaveRequest: exports.createLeaveRequest,
  updateLeaveRequest: exports.updateLeaveRequest,
  deleteLeaveRequest: exports.deleteLeaveRequest,
  approveLeaveRequest: exports.approveLeaveRequest,
  rejectLeaveRequest: exports.rejectLeaveRequest,
  uploadAttachments: exports.uploadAttachments,
  getLeaveRequestsByParent: exports.getLeaveRequestsByParent,
  getLeaveRequestsByStudent: exports.getLeaveRequestsByStudent
}; 