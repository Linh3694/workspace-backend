// controllers/studentClassEnrollmentController.js
const StudentClassEnrollment = require("../../models/StudentClassEnrollment");
const xlsx = require("xlsx");
const fs = require("fs");
// import model Student, Class, SchoolYear
const Student = require("../../models/Students");
const ClassModel = require("../../models/Class");
const SchoolYear = require("../../models/SchoolYear");

exports.enrollStudentToClass = async (req, res) => {
  try {
    const { student, class: classId, schoolYear } = req.body;

    // Tìm xem đã có enrollment cho học sinh này trong cùng năm học chưa
    const existingEnrollment = await StudentClassEnrollment.findOne({
      student,
      schoolYear
    });

    if (existingEnrollment) {
      // Đã có => cập nhật sang lớp mới
      existingEnrollment.class = classId;
      await existingEnrollment.save();
      return res.status(200).json(existingEnrollment);
    } else {
      // Chưa có => tạo mới
      const newEnrollment = await StudentClassEnrollment.create(req.body);
      return res.status(201).json(newEnrollment);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getAllEnrollments = async (req, res) => {
  try {
    const result = await StudentClassEnrollment.find()
      .populate("student")
      .populate("class")
      .populate("schoolYear");
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getEnrollmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await StudentClassEnrollment.findById(id)
      .populate("student")
      .populate("class")
      .populate("schoolYear");
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    return res.json(enrollment);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.updateEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await StudentClassEnrollment.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.deleteEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await StudentClassEnrollment.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    return res.json({ message: "Enrollment deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// controllers/studentClassEnrollmentController.js
exports.bulkUploadEnrollments = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Đọc file Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
    // Ví dụ row: { StudentCode: "HS001", ClassName: "10A1", SchoolYearCode: "2023-2024", startDate: "01/07/2023", endDate: "..." }

    // Thu thập các giá trị duy nhất từ các cột cần thiết
    const studentCodes = new Set();
    const classNames = new Set();
    const schoolYearCodes = new Set();
    rows.forEach(row => {
      if (row.StudentCode) studentCodes.add(row.StudentCode.trim());
      if (row.ClassName) classNames.add(row.ClassName.trim());
      if (row.SchoolYearCode) schoolYearCodes.add(row.SchoolYearCode.trim());
    });

    // Truy vấn Student theo studentCode
    const students = await Student.find({ studentCode: { $in: Array.from(studentCodes) } });
    const studentMap = {};
    students.forEach(s => {
      if (s.studentCode) studentMap[s.studentCode.trim()] = s;
    });

    // Truy vấn SchoolYear theo code
    const schoolYears = await SchoolYear.find({ code: { $in: Array.from(schoolYearCodes) } });
    const schoolYearMap = {};
    schoolYears.forEach(sy => {
      if (sy.code) schoolYearMap[sy.code.trim()] = sy._id;
    });

    // Truy vấn Class theo className (lưu ý: nếu có nhiều lớp cùng tên cho các năm khác nhau, ta cần xác định theo schoolYear)
    const classes = await ClassModel.find({ className: { $in: Array.from(classNames) } }).populate("schoolYear");
    const classMap = {};
    classes.forEach(cls => {
      if (cls.className && cls.schoolYear && cls.schoolYear.code) {
        // Key có dạng: "10A1_2023-2024"
        const key = `${cls.className.trim()}_${cls.schoolYear.code.trim()}`;
        classMap[key] = cls;
      }
    });

    // Chuẩn bị các thao tác bulkWrite
    const bulkOps = [];
    rows.forEach(row => {
      const studentCode = row.StudentCode ? row.StudentCode.trim() : null;
      const className = row.ClassName ? row.ClassName.trim() : null;
      const schoolYearCode = row.SchoolYearCode ? row.SchoolYearCode.trim() : null;
      if (!studentCode || !className || !schoolYearCode) return; // bỏ qua nếu thiếu thông tin

      const student = studentMap[studentCode];
      const schoolYearId = schoolYearMap[schoolYearCode];
      if (!student || !schoolYearId) return;

      const key = `${className}_${schoolYearCode}`;
      const klass = classMap[key];
      if (!klass) return;

      bulkOps.push({
        updateOne: {
          filter: { student: student._id, class: klass._id, schoolYear: schoolYearId },
          update: {
            $set: {
              startDate: parseDate(row.startDate),
              endDate: parseDate(row.endDate)
            }
          },
          upsert: true,
        },
      });
    });
    if (bulkOps.length > 0) {
      const result = await StudentClassEnrollment.bulkWrite(bulkOps);
      return res.json({ message: "Bulk upload Enrollments success!", result });
    } else {
      return res.json({ message: "No valid enrollment data found." });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    // Optionally: fs.unlinkSync(req.file.path);
  }
};

// Hàm parseDate theo định dạng "DD/MM/YYYY"
function parseDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length < 3) return null;
  const [day, month, year] = parts;
  return new Date(+year, +month - 1, +day);
}