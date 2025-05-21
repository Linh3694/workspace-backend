// controllers/teacherController.js
const Teacher = require("../../models/Teacher");

// Tạo giáo viên mới
exports.createTeacher = async (req, res) => {
  try {
    const { user, fullName, subjects, classes, phone, email } = req.body;
    const newTeacher = await Teacher.create({
      user,
      fullName,
      subjects,
      classes,
      phone,
      email,
    });
    return res.status(201).json(newTeacher);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy tất cả giáo viên
exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find()
      .populate("user", "username email")
      .populate("subjects")
      .populate("classes");
    return res.json(teachers);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy giáo viên theo ID
exports.getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;
    const teacher = await Teacher.findById(id)
      .populate("user", "username email")
      .populate("subjects")
      .populate("classes");
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    return res.json(teacher);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật giáo viên
exports.updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, subjects, classes, phone, email } = req.body;
    const updated = await Teacher.findByIdAndUpdate(
      id,
      { fullName, subjects, classes, phone, email },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa giáo viên
exports.deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Teacher.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    return res.json({ message: "Teacher deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Nhập hàng loạt giáo viên từ Excel
exports.bulkUploadTeachers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const teachersToInsert = [];
    for (const row of rows) {
      const user = await User.findOne({ email: row.Email });
      if (!user) continue;
      teachersToInsert.push({
        user: user._id,
        fullName: row.FullName,
        phone: row.Phone,
        email: row.Email,
        subjects: [], // Có thể thêm logic tìm Subject nếu có cột SubjectCode
        classes: [], // Có thể thêm logic tìm Class nếu có cột ClassName
      });
    }

    if (teachersToInsert.length > 0) {
      await Teacher.insertMany(teachersToInsert);
      return res.json({ message: `Added ${teachersToInsert.length} teachers` });
    }
    return res.json({ message: "No valid data found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};