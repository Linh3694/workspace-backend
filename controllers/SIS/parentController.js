const Parent = require("../../models/Parent");
const User = require("../../models/Users");
const Family = require("../../models/Family");

// Lấy danh sách tất cả phụ huynh
exports.getAllParents = async (req, res) => {
    try {
        const parents = await Parent.find().populate('user', 'active username phone');
        res.status(200).json(parents);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Lấy thông tin một phụ huynh theo ID
exports.getParentById = async (req, res) => {
    try {
        const parent = await Parent.findById(req.params.id);
        if (!parent) {
            return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
        }
        res.status(200).json(parent);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Tạo phụ huynh mới
exports.createParent = async (req, res) => {
    try {
        console.log('🔍 [CreateParent] Request body:', req.body);
        console.log('🔍 [CreateParent] Request user:', req.user);
        
        const { user, fullname, phone, email } = req.body;
        
        // Validate required fields
        if (!fullname || !email) {
            console.log('❌ [CreateParent] Missing required fields');
            return res.status(400).json({ message: 'Fullname and email are required' });
        }
        
        // Check if parent with same email already exists
        const existingParent = await Parent.findOne({ email });
        if (existingParent) {
            console.log('❌ [CreateParent] Parent with email already exists:', email);
            return res.status(400).json({ message: 'Parent with this email already exists' });
        }
        
        const parent = new Parent(req.body);
        const savedParent = await parent.save();
        console.log('✅ [CreateParent] Parent created successfully:', savedParent._id);
        
        // Populate user data nếu có
        const populatedParent = await Parent.findById(savedParent._id).populate('user', 'active username');
        res.status(201).json(populatedParent);
    } catch (err) {
        console.error('❌ [CreateParent] Error:', err);
        res.status(400).json({ message: err.message });
    }
};

// Cập nhật thông tin phụ huynh
exports.updateParent = async (req, res) => {
    try {
        const parent = await Parent.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!parent) {
            return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
        }
        res.status(200).json(parent);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// Xóa phụ huynh
exports.deleteParent = async (req, res) => {
    try {
        const parent = await Parent.findByIdAndDelete(req.params.id);
        // Xóa luôn user nếu phụ huynh có tài khoản
        if (parent && parent.user) {
            await User.findByIdAndDelete(parent.user);
        }
        // Remove dangling references from any Family documents
        await Family.updateMany(
            { "parents.parent": req.params.id },
            { $pull: { parents: { parent: req.params.id } } }
        );
        if (!parent) {
            return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
        }
        res.status(200).json({ message: 'Đã xóa phụ huynh thành công' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
