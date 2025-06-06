const mongoose = require("mongoose");
const GradeLevel = require("../../models/GradeLevel");
const School = require("../../models/School");
const Subject = require("../../models/Subject");

// Lấy tất cả khối lớp
exports.getAllGradeLevels = async (req, res) => {
  try {
    const { school } = req.query;
    const query = school ? { school } : {};

    const gradeLevels = await GradeLevel.find(query)
      .populate('school', 'name code type')
      .populate('classes', 'className')
      .populate('subjects', 'name code')
      .sort({ order: 1 });
    res.json({ data: gradeLevels });
  } catch (error) {
    console.error('Error getting grade levels:', error);
    res.status(500).json({ message: "Không thể lấy danh sách khối lớp" });
  }
};

// Lấy khối lớp theo hệ thống giáo dục
exports.getGradeLevelsByEducationalSystem = async (req, res) => {
  try {
    const { educationalSystemId } = req.params;
    const gradeLevels = await GradeLevel.find()
      .populate('school')
      .sort({ order: 1 });
    res.json({ data: gradeLevels });
  } catch (error) {
    console.error('Error getting grade levels by educational system:', error);
    res.status(500).json({ message: "Không thể lấy danh sách khối lớp" });
  }
};

// Tạo khối lớp mới
exports.createGradeLevel = async (req, res) => {
  try {
    const { name, description, schoolId, qualities } = req.body;

    // Kiểm tra trùng tên trong cùng trường
    const existingGradeLevel = await GradeLevel.findOne({
      name,
      school: schoolId
    });

    if (existingGradeLevel) {
      return res.status(400).json({ message: "Tên khối lớp đã tồn tại trong trường này" });
    }

    // Kiểm tra qualities hợp lệ
    if (!Array.isArray(qualities) || qualities.length === 0) {
      return res.status(400).json({ message: "Phải chọn ít nhất một chất lượng" });
    }

    // Tìm số thứ tự lớn nhất hiện tại
    const maxOrder = await GradeLevel.findOne({ school: schoolId })
      .sort({ order: -1 })
      .select('order');

    const order = maxOrder ? maxOrder.order + 1 : 1;

    // Tạo khối lớp mới
    const gradeLevel = new GradeLevel({
      name,
      description,
      school: schoolId,
      order,
      qualities
    });

    await gradeLevel.save();

    // Populate thông tin trường
    const populatedGradeLevel = await GradeLevel.findById(gradeLevel._id)
      .populate('school', 'name code type');

    res.status(201).json({ data: populatedGradeLevel });
  } catch (error) {
    console.error('Error creating grade level:', error);
    res.status(500).json({ message: error.message });
  }
};

// Sync subjects cho grade level
const syncSubjectsForGradeLevel = async (gradeLevelId, subjectIds) => {
  try {
    // 1. Xóa grade level khỏi các subject cũ không còn trong danh sách mới
    await Subject.updateMany(
      { gradeLevels: gradeLevelId, _id: { $nin: subjectIds } },
      { $pull: { gradeLevels: gradeLevelId } }
    );

    // 2. Thêm grade level vào các subject mới
    await Subject.updateMany(
      { _id: { $in: subjectIds } },
      { $addToSet: { gradeLevels: gradeLevelId } }
    );

    // 3. Cập nhật danh sách subjects cho grade level
    await GradeLevel.findByIdAndUpdate(
      gradeLevelId,
      { $set: { subjects: subjectIds } }
    );
  } catch (error) {
    console.error('Error syncing subjects for grade level:', error);
    throw error;
  }
};

// Cập nhật khối lớp
exports.updateGradeLevel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, school: schoolId, qualities, subjects } = req.body;

    // Kiểm tra khối lớp tồn tại
    const currentGradeLevel = await GradeLevel.findById(id);
    if (!currentGradeLevel) {
      return res.status(404).json({ message: "Không tìm thấy khối lớp" });
    }

    // Kiểm tra trùng tên trong cùng trường
    if (schoolId) {
      const existingGradeLevel = await GradeLevel.findOne({
        name,
        school: schoolId,
        _id: { $ne: id }
      });

      if (existingGradeLevel) {
        return res.status(400).json({ message: "Tên khối lớp đã tồn tại trong trường này" });
      }
    }

    // Kiểm tra qualities hợp lệ
    if (!Array.isArray(qualities) || qualities.length === 0) {
      return res.status(400).json({ message: "Phải chọn ít nhất một chất lượng" });
    }

    const updatedGradeLevel = await GradeLevel.findByIdAndUpdate(
      id,
      {
        name,
        description,
        school: schoolId,
        qualities,
        updatedAt: Date.now()
      },
      { new: true }
    ).populate('school', 'name code type')
      .populate('subjects', 'name code');

    if (!updatedGradeLevel) {
      return res.status(404).json({ message: "Không tìm thấy khối lớp" });
    }

    // Sync subjects nếu có trong request
    if (Array.isArray(subjects)) {
      await syncSubjectsForGradeLevel(id, subjects);
    }

    res.json({ data: updatedGradeLevel });
  } catch (error) {
    console.error('Error updating grade level:', error);
    res.status(400).json({ message: "Không thể cập nhật khối lớp" });
  }
};

// Xóa khối lớp
exports.deleteGradeLevel = async (req, res) => {
  try {
    const gradeLevel = await GradeLevel.findById(req.params.id);
    if (!gradeLevel) {
      return res.status(404).json({ message: "Không tìm thấy khối lớp" });
    }

    await GradeLevel.deleteOne({ _id: req.params.id });
    res.json({ message: "Xóa khối lớp thành công" });
  } catch (error) {
    console.error('Error deleting grade level:', error);
    res.status(500).json({ message: "Không thể xóa khối lớp" });
  }
}; 