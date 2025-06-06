const Parent = require("../../models/Parent");
const User = require("../../models/Users");
const Family = require("../../models/Family");

// Lấy danh sách tất cả phụ huynh
exports.getAllParents = async (req, res) => {
    try {
        const parents = await Parent.find();
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
        const parent = new Parent(req.body);
        await parent.save();
        res.status(201).json(parent);
    } catch (err) {
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
