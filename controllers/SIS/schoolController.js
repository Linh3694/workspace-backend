const mongoose = require("mongoose");
const School = require("../../models/School");

// Tạo trường mới
exports.createSchool = async (req, res) => {
    try {
        const { name, code, type, description } = req.body;

        // Kiểm tra dữ liệu đầu vào
        if (!name) {
            return res.status(400).json({ message: "Tên trường là bắt buộc" });
        }

        // Kiểm tra trùng mã
        const existingSchool = await School.findOne({ code });
        if (existingSchool) {
            return res.status(400).json({ message: "Mã trường đã tồn tại" });
        }

        const newSchool = await School.create({
            name,
            description
        });

        // Populate các trường liên quan
        const populatedSchool = await School.findById(newSchool._id)
            .populate('gradeLevels')
            .populate('educationalSystems')
            .populate('curriculums');

        return res.status(201).json({ data: populatedSchool });
    } catch (err) {
        console.error('Error in createSchool:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Lấy danh sách trường
exports.getSchools = async (req, res) => {
    try {
        const schools = await School.find()
            .populate('gradeLevels')
            .populate('educationalSystems')
            .populate('curriculums')
            .sort({ name: 1 });
        return res.json({ data: schools });
    } catch (err) {
        console.error('Error in getSchools:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Lấy trường theo ID
exports.getSchoolById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID trường không hợp lệ" });
        }

        const school = await School.findById(id)
            .populate({
                path: 'gradeLevels',
                select: 'name code description order'
            })
            .populate({
                path: 'educationalSystems',
                select: 'name description'
            })
            .populate({
                path: 'curriculums',
                select: 'name description'
            });

        if (!school) {
            return res.status(404).json({ message: "Không tìm thấy trường" });
        }

        return res.json({ data: school });
    } catch (err) {
        console.error('Error in getSchoolById:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Cập nhật trường
exports.updateSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID trường không hợp lệ" });
        }

        // Kiểm tra trùng mã khi cập nhật
        if (updateData.code) {
            const existingSchool = await School.findOne({
                code: updateData.code,
                _id: { $ne: id }
            });
            if (existingSchool) {
                return res.status(400).json({ message: "Mã trường đã tồn tại" });
            }
        }

        const updatedSchool = await School.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        )
            .populate('gradeLevels')
            .populate('educationalSystems')
            .populate('curriculums');

        if (!updatedSchool) {
            return res.status(404).json({ message: "Không tìm thấy trường" });
        }

        return res.json({ data: updatedSchool });
    } catch (err) {
        console.error('Error in updateSchool:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Xóa trường
exports.deleteSchool = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID trường không hợp lệ" });
        }

        const deletedSchool = await School.findByIdAndDelete(id);
        if (!deletedSchool) {
            return res.status(404).json({ message: "Không tìm thấy trường" });
        }

        return res.json({ data: { message: "Xóa trường thành công" } });
    } catch (err) {
        console.error('Error in deleteSchool:', err);
        return res.status(500).json({ error: err.message });
    }
}; 