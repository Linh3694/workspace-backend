// controllers/gradeController.js
const Grade = require("../../models/Grade");

// Tạo điểm số mới
exports.createGrade = async (req, res) => {
  try {
    const { student, class: classId, subject, schoolYear, semester, score, type } = req.body;
    const newGrade = await Grade.create({
      student,
      class: classId,
      subject,
      schoolYear,
      semester,
      score,
      type,
    });
    return res.status(201).json(newGrade);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy điểm số của học sinh
exports.getGradesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolYearId, semester } = req.query;
    const query = { student: studentId };
    if (schoolYearId) query.schoolYear = schoolYearId;
    if (semester) query.semester = semester;
    const grades = await Grade.find(query)
      .populate("class")
      .populate("subject")
      .populate("schoolYear");
    return res.json(grades);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy điểm số của lớp
exports.getGradesByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolYearId, semester } = req.query;
    const query = { class: classId };
    if (schoolYearId) query.schoolYear = schoolYearId;
    if (semester) query.semester = semester;
    const grades = await Grade.find(query)
      .populate("student")
      .populate("subject")
      .populate("schoolYear");
    return res.json(grades);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật điểm số
exports.updateGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Grade.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Grade not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa điểm số
exports.deleteGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Grade.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Grade not found" });
    }
    return res.json({ message: "Grade deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Nhập hàng loạt điểm số từ Excel
exports.bulkUploadGrades = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const gradesToInsert = [];
    for (const row of rows) {
      const student = await Student.findOne({ studentCode: row.StudentCode });
      const classObj = await Class.findOne({ className: row.ClassName });
      const subject = await Subject.findOne({ name: row.Subject });
      const schoolYear = await SchoolYear.findOne({ code: row.SchoolYearCode });
      if (!student || !classObj || !subject || !schoolYear) continue;
      gradesToInsert.push({
        student: student._id,
        class: classObj._id,
        subject: subject._id,
        schoolYear: schoolYear._id,
        semester: row.Semester,
        score: row.Score,
        type: row.Type,
      });
    }

    if (gradesToInsert.length > 0) {
      await Grade.insertMany(gradesToInsert);
      return res.json({ message: `Added ${gradesToInsert.length} grades` });
    }
    return res.json({ message: "No valid data found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};