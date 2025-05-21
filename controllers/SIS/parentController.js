// controllers/parentController.js
const Parent = require("../../models/Parent");

// Tạo phụ huynh mới
exports.createParent = async (req, res) => {
  try {
    const { user, fullName, phone, email, students } = req.body;
    const newParent = await Parent.create({
      user,
      fullName,
      phone,
      email,
      students,
    });
    // Đồng bộ Student.parents
    if (students && students.length > 0) {
      await Student.updateMany(
        { _id: { $in: students } },
        { $addToSet: { parents: newParent._id } }
      );
    }
    return res.status(201).json(newParent);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy tất cả phụ huynh
exports.getAllParents = async (req, res) => {
  try {
    const parents = await Parent.find()
      .populate("user", "username email")
      .populate("students", "studentCode name");
    return res.json(parents);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy phụ huynh theo ID
exports.getParentById = async (req, res) => {
  try {
    const { id } = req.params;
    const parent = await Parent.findById(id)
      .populate("user", "username email")
      .populate("students", "studentCode name");
    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }
    return res.json(parent);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật phụ huynh
exports.updateParent = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, email, students } = req.body;
    const updated = await Parent.findByIdAndUpdate(
      id,
      { fullName, phone, email, students },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Parent not found" });
    }
    // Đồng bộ Student.parents
    if (students) {
      await Student.updateMany(
        { parents: id },
        { $pull: { parents: id } }
      );
      await Student.updateMany(
        { _id: { $in: students } },
        { $addToSet: { parents: id } }
      );
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa phụ huynh
exports.deleteParent = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Parent.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Parent not found" });
    }
    // Gỡ khỏi Student.parents
    await Student.updateMany(
      { parents: id },
      { $pull: { parents: id } }
    );
    return res.json({ message: "Parent deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Nhập hàng loạt phụ huynh từ Excel
exports.bulkUploadParents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const parentsToInsert = [];
    for (const row of rows) {
      const user = await User.findOne({ email: row.Email });
      if (!user) continue;
      const students = await Student.find({ studentCode: { $in: row.StudentCodes?.split(",") || [] } });
      parentsToInsert.push({
        user: user._id,
        fullName: row.FullName,
        phone: row.Phone,
        email: row.Email,
        students: students.map(s => s._id),
      });
    }

    if (parentsToInsert.length > 0) {
      const newParents = await Parent.insertMany(parentsToInsert);
      // Đồng bộ Student.parents
      for (const parent of newParents) {
        await Student.updateMany(
          { _id: { $in: parent.students } },
          { $addToSet: { parents: parent._id } }
        );
      }
      return res.json({ message: `Added ${newParents.length} parents` });
    }
    return res.json({ message: "No valid data found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};