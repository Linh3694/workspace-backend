// controllers/studentController.js

const Student = require("../../models/Students");
const Family = require("../../models/Parent");
const StudentClassEnrollment = require("../../models/StudentClassEnrollment");
const SchoolYear = require("../../models/SchoolYear");
const Photo = require("../../models/Photo");
const xlsx = require("xlsx");
const fs = require("fs");

/** Tạo 1 student */
exports.createStudent = async (req, res) => {
  try {
    const newStudent = await Student.create(req.body);
    return res.status(201).json(newStudent);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

/** Lấy tất cả student */
exports.getAllStudents = async (req, res) => {
  try {
    const students = await Student.find();
    return res.json(students);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

/** Lấy 1 student theo id */
exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }
    return res.json(student);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

/** Update 1 student */
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Student.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Student not found" });
    }
    // Nếu family thay đổi => cập nhật 2 chiều
    // ...
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

/** Xoá 1 student */
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Student.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Student not found" });
    }
    // Gỡ student khỏi Family.students (nếu xài 2 chiều)
    if (deleted.family) {
      await Family.findByIdAndUpdate(deleted.family, {
        $pull: { students: deleted._id },
      });
    }
    return res.json({ message: "Student deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.bulkUploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Đọc Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    for (const row of rows) {
      // Lấy mã học sinh
      const studentCode = row["ID học sinh"]?.toString().trim();
      if (!studentCode) continue; // Bỏ qua nếu ko có ID

      // Tìm student
      let student = await Student.findOne({ studentCode });
      if (!student) {
        // Create
        student = new Student({
          studentCode,
          name: row["Họ tên HS"] || "Unknown",
          birthDate: parseExcelDate(row["Ngày sinh(DD/MM/YYYY)"]),
          email: row["Email"] || "",
        });
      } else {
        // Update
        student.name = row["Họ tên HS"] || student.name;
        const newBD = parseExcelDate(row["Ngày sinh(DD/MM/YYYY)"]);
        if (newBD) student.birthDate = newBD;
        const newEmail = row["Email"];
        if (newEmail) student.email = newEmail;
      }
      await student.save();
      
    }

    return res.json({ message: "Bulk upload Students success!" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  } finally {
  }
};

/**
 * parseExcelDate:
 * - Nếu là number => parse bằng xlsx.SSF.parse_date_code (Excel serial date).
 * - Nếu là string => parse DD/MM/YYYY
 */
function parseExcelDate(value) {
  if (!value) return null;

  // Trường hợp value là số => Excel date code
  if (typeof value === "number") {
    // Xài xlsx.SSF.parse_date_code
    const dateObj = xlsx.SSF.parse_date_code(value);
    if (dateObj) {
      return new Date(dateObj.y, dateObj.m - 1, dateObj.d);
    }
    return null;
  }

  // Nếu là string => parse dd/MM/yyyy
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (d && m && y) {
        return new Date(y, m - 1, d);
      }
    }
  }
  return null;
}

exports.searchStudents = async (req, res) => {
  try {
    const q = req.query.q?.trim() || "";
    if (!q) {
      return res.json([]); // Trả về mảng rỗng nếu query trống
    }

    // 1) Tìm students
    const students = await Student.find({
      $or: [
        { studentCode: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
      ],
    })
      .limit(20)
      .lean();

    if (!students.length) {
      return res.json([]); // Trả về mảng rỗng nếu không tìm thấy
    }

    // 2) Lấy current school year
    const now = new Date();
    let currentSchoolYear = await SchoolYear.findOne({
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ startDate: -1 }).lean();

    if (!currentSchoolYear) {
      currentSchoolYear = await SchoolYear.findOne().sort({ startDate: -1 }).lean();
    }

    if (!currentSchoolYear) {
      return res.status(500).json({ error: "No school year found" });
    }

    // 3) Tối ưu hóa: Query enrollment và photo cùng lúc
    const studentIds = students.map((s) => s._id);
    const [enrollments, photos] = await Promise.all([
      StudentClassEnrollment.find({
        student: { $in: studentIds },
        schoolYear: currentSchoolYear._id,
      })
        .populate("class")
        .lean(),
      Photo.find({
        student: { $in: studentIds },
        schoolYear: currentSchoolYear._id,
      }).lean(),
    ]);

    // 4) Map dữ liệu
    const results = students.map((s) => {
      const enrollment = enrollments.find((e) => e.student.toString() === s._id.toString());
      const photo = photos.find((p) => p.student.toString() === s._id.toString());

      return {
        _id: s._id,
        studentId: s.studentCode || "",
        fullName: s.name || "",
        email: s.email || "",
        className: enrollment?.class?.className || "",
        photoUrl: photo?.photoUrl || "",
      };
    });

    return res.json(results);
  } catch (err) {
    console.error("Error searching students:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};