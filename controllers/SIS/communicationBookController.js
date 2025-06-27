const asyncHandler = require('express-async-handler');
const CommunicationBook = require('../../models/CommunicationBook');

// Lấy danh sách tất cả các bản ghi sổ liên lạc
exports.getCommunicationBooks = asyncHandler(async (req, res) => {
    const communicationBooks = await CommunicationBook.find()
        .populate('student', 'name studentCode')
        .populate('teacher', 'fullname')

        .sort({ date: -1 });
    console.log('Kết quả truy vấn:', communicationBooks);
    res.json(communicationBooks);
});

// Lấy tất cả bản ghi sổ liên lạc của một học sinh
exports.getCommunicationBooksByStudent = asyncHandler(async (req, res) => {
    console.log('req.params.studentId:', req.params.studentId);
    const studentId = req.params.studentId;
    const communicationBooks = await CommunicationBook.find({ student: studentId })
        .populate('student', 'name studentCode')
        .populate('teacher', 'fullname')

        .sort({ date: -1 });
    console.log('Kết quả truy vấn:', communicationBooks);
    res.json(communicationBooks);
});

// Lấy một bản ghi sổ liên lạc theo ID
exports.getCommunicationBookById = asyncHandler(async (req, res) => {
    const communicationBook = await CommunicationBook.findById(req.params.id)
        .populate('student', 'name studentCode')
        .populate('teacher', 'fullname')


    if (!communicationBook) {
        return res.status(404).json({ message: 'Không tìm thấy bản ghi sổ liên lạc' });
    }

    res.json(communicationBook);
});

// Tạo một bản ghi sổ liên lạc mới
exports.createCommunicationBook = asyncHandler(async (req, res) => {
    // Lấy thông tin người dùng hiện tại từ req.user (giả sử middleware xác thực đã thêm)
    const teacherId = req.user?.teacherId || req.body.teacher;
    
    // Lấy role của user từ req.user hoặc req.body
    const userRole = req.user?.role || req.body.userRole;

    // Chỉ yêu cầu teacherId bắt buộc nếu không phải admin/superadmin
    if (!teacherId && userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(400).json({ message: 'Cần cung cấp ID giáo viên' });
    }

    const { ratings, ...rest } = req.body;
    // Normalize date to midnight for lookup
    const providedDate = req.body.date ? new Date(req.body.date) : new Date();
    const start = new Date(providedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(providedDate);
    end.setHours(23, 59, 59, 999);
    // Check for existing entry
    const existing = await CommunicationBook.findOne({
        student: rest.student,
        date: { $gte: start, $lt: end }
    });
    if (existing) {
        return res.status(400).json({ message: 'Đã tạo sổ liên lạc cho học sinh này trong ngày.' });
    }

    const communicationBook = new CommunicationBook({
        ...rest,
        ratings,
        teacher: teacherId || null, // Cho phép null nếu là admin/superadmin
        date: providedDate
    });

    const newCommunicationBook = await communicationBook.save();

    // Populate thông tin chi tiết trước khi trả về
    const populatedCommunicationBook = await CommunicationBook.findById(newCommunicationBook._id)
        .populate('student', 'name studentCode')
        .populate('teacher', 'fullname')


    res.status(201).json(populatedCommunicationBook);
});

// Cập nhật một bản ghi sổ liên lạc
exports.updateCommunicationBook = asyncHandler(async (req, res) => {
    const communicationBook = await CommunicationBook.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
    )
        .populate('student', 'name studentCode')
        .populate('teacher', 'fullname')

    if (!communicationBook) {
        return res.status(404).json({ message: 'Không tìm thấy bản ghi sổ liên lạc' });
    }

    res.json(communicationBook);
});

// Xóa một bản ghi sổ liên lạc
exports.deleteCommunicationBook = asyncHandler(async (req, res) => {
    const communicationBook = await CommunicationBook.findByIdAndDelete(req.params.id);

    if (!communicationBook) {
        return res.status(404).json({ message: 'Không tìm thấy bản ghi sổ liên lạc' });
    }

    res.json({ message: 'Đã xóa bản ghi sổ liên lạc thành công' });
}); 