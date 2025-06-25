const asyncHandler = require('express-async-handler');
const Family = require('../../models/Family');
const User = require('../../models/Users');
const Student = require('../../models/Student');
const Parent = require('../../models/Parent');

// Lấy danh sách tất cả Family
exports.getFamilies = asyncHandler(async (req, res) => {
    try {
        const families = await Family.find()
            .populate({
                path: 'parents.parent',
                select: 'fullname phone email user',
                populate: { path: 'user', select: 'active username phone' }
            })
            .populate({
                path: 'students',
                select: 'studentCode name'
            });

        if (families.length > 0) {
            if (families[0].parents?.length > 0) {
                console.log('Sample parent in family:', JSON.stringify(families[0].parents[0], null, 2));
            }
        }
        res.json(families);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách gia đình:', err);
        res.status(500).json({ message: err.message });
    }
});

// Lấy Family theo ID
exports.getFamilyById = asyncHandler(async (req, res) => {
    try {
        const family = await Family.findById(req.params.id)
            .populate({
                path: 'parents.parent',
                select: 'fullname phone email user',
                populate: { path: 'user', select: 'active username' }
            })
            .populate({
                path: 'students',
                select: 'studentCode name'
            });

        if (!family) {
            return res.status(404).json({ message: 'Không tìm thấy gia đình' });
        }
        res.json(family);
    } catch (err) {
        console.error('Lỗi khi lấy thông tin gia đình:', err);
        res.status(500).json({ message: err.message });
    }
});

// Tạo Family mới
exports.createFamily = asyncHandler(async (req, res) => {
    const { familyCode, address } = req.body;

    // Kiểm tra familyCode đã tồn tại chưa
    const existingFamily = await Family.findOne({ familyCode });
    if (existingFamily) {
        return res.status(400).json({ message: 'Mã gia đình đã tồn tại' });
    }

    // Tạo Family mới
    const family = new Family({
        familyCode,
        address,
    });

    const newFamily = await family.save();
    res.status(201).json(newFamily);
});

// Cập nhật Family (chỉ cập nhật thông tin chung, không động đến parents)
exports.updateFamily = asyncHandler(async (req, res) => {
    const { familyCode, address } = req.body;

    // Kiểm tra familyCode mới có bị trùng không (nếu có thay đổi)
    if (familyCode) {
        const existingFamily = await Family.findOne({
            familyCode,
            _id: { $ne: req.params.id }
        });
        if (existingFamily) {
            return res.status(400).json({ message: 'Mã gia đình đã tồn tại' });
        }
    }

    const family = await Family.findByIdAndUpdate(
        req.params.id,
        {
            familyCode,
            address,
        },
        { new: true }
    );

    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }

    res.json(family);
});

// Xóa Family
exports.deleteFamily = asyncHandler(async (req, res) => {    
    const family = await Family.findById(req.params.id);

    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }

    // Kiểm tra xem Family có liên kết với Student nào không
    if (family.students && family.students.length > 0) {
        return res.status(400).json({
            message: 'Không thể xóa gia đình đang có học sinh liên kết'
        });
    }
    await Family.findByIdAndDelete(req.params.id);
    res.json({ message: 'Xóa gia đình thành công' });
});

// Thêm Parent vào Family (POST /families/:id/add-parent)
exports.addParentToFamily = asyncHandler(async (req, res) => {
    const { parentId, relationship } = req.body;
    const familyId = req.params.id;

    // Validate input
    if (!parentId || !relationship) {
        return res.status(400).json({ message: 'ParentId and relationship are required' });
    }

    // Check if family exists
    const family = await Family.findById(familyId);
    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }

    // Check if parent exists
    const parent = await Parent.findById(parentId);
    if (!parent) {
        return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
    }

    // Kiểm tra parent đã tồn tại trong family chưa
    const existingParent = family.parents.find(
        p => p.parent.toString() === parentId
    );
    if (existingParent) {
        return res.status(400).json({ message: 'Phụ huynh đã tồn tại trong gia đình' });
    }

    // Thêm parent vào family
    family.parents.push({
        parent: parentId,
        relationship
    });

    await family.save();
    res.json(family);
});

// Xóa Parent khỏi Family (DELETE /families/:id/remove-parent/:parentId)
exports.removeParentFromFamily = asyncHandler(async (req, res) => {
    const { parentId } = req.params;
    const familyId = req.params.id;

    const family = await Family.findById(familyId);
    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }

    // Gỡ liên kết parent khỏi family (KHÔNG xóa bản ghi Parent)
    const before = family.parents.length;
    const targetId = parentId.toString();
    family.parents = family.parents.filter(p => {
        // p.parent có thể là ObjectId hoặc đã được populate thành document
        const currentId =
            typeof p.parent === "object" && p.parent !== null
                ? p.parent._id.toString()
                : p.parent.toString();
        return currentId !== targetId;
    });
    const after = family.parents.length;

    if (before === after) {
        return res.status(404).json({ message: 'Phụ huynh không tồn tại trong gia đình' });
    }

    await family.save();
    // Xóa bản ghi Parent và User liên quan
    const removedParentDoc = await Parent.findByIdAndDelete(parentId);
    if (removedParentDoc && removedParentDoc.user) {
        await User.findByIdAndDelete(removedParentDoc.user);
    }
    res.json({ message: 'Đã gỡ phụ huynh khỏi gia đình', family });
});

// Tìm kiếm Family theo mã
exports.getFamilyByCode = asyncHandler(async (req, res) => {
    const family = await Family.findOne({ familyCode: req.params.code })
        .populate({
            path: 'parents.parent',
            select: 'fullname phone email user',
            populate: { path: 'user', select: 'active' }
        })
        .populate({
            path: 'students',
            select: 'studentCode name'
        });

    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }
    res.json(family);
});

// Cập nhật thông tin Parent trong Family
exports.updateParentInFamily = asyncHandler(async (req, res) => {
    const { familyId, parentId } = req.params;
    const { relationship } = req.body;

    const family = await Family.findById(familyId);
    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }

    // Tìm parent trong family
    const parentIndex = family.parents.findIndex(p => {
        const currentId =
            typeof p.parent === "object" && p.parent !== null
                ? p.parent._id.toString()
                : p.parent.toString();
        return currentId === parentId;
    });

    if (parentIndex === -1) {
        return res.status(404).json({ message: 'Không tìm thấy phụ huynh trong gia đình' });
    }

    // Cập nhật thông tin parent
    family.parents[parentIndex].relationship = relationship;

    await family.save();
    res.json(family);
});

// Xóa Student khỏi Family (DELETE /families/:id/remove-student/:studentId)
exports.removeStudentFromFamily = asyncHandler(async (req, res) => {
    const { id, studentId } = req.params;

    // 1. Tìm Family
    const family = await Family.findById(id);
    if (!family) {
        return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }

    // 2. Gỡ studentId ra khỏi mảng students
    const before = family.students.length;
    family.students = family.students.filter(s => s.toString() !== studentId);
    if (before === family.students.length) {
        return res.status(404).json({ message: 'Học sinh không tồn tại trong gia đình' });
    }
    await family.save();

    // 3. Cập nhật Student.family = undefined
    const student = await Student.findById(studentId);
    if (student && student.family && student.family.toString() === id) {
        student.family = undefined;
        await student.save();
    }

    res.json({ message: 'Đã xoá học sinh khỏi gia đình', family });
});

// Các phương thức trùng lặp đã được xóa