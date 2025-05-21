// controllers/classController.js
const ClassModel = require("../../models/Class");
const xlsx = require("xlsx"); // hoặc exceljs

exports.createClass = async (req, res) => {
  try {
    const { className, schoolYear, homeroomTeachers } = req.body;
    const formattedTeachers = Array.isArray(homeroomTeachers)
     ? homeroomTeachers
     : homeroomTeachers
     ? [homeroomTeachers]
     : [];

    const newClass = await ClassModel.create({
     className,
     schoolYear,
     homeroomTeachers: formattedTeachers,
});
    return res.status(201).json(newClass);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getAllClasses = async (req, res) => {
  try {
    const classes = await ClassModel.find()
    .populate("homeroomTeachers", "fullname email avatarUrl")
    .populate("schoolYear");
    return res.json(classes);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getClassById = async (req, res) => {
  try {
    const { id } = req.params;
    const found = await ClassModel.findById(id).populate("schoolYear");
    if (!found) {
      return res.status(404).json({ message: "Class not found" });
    }
    return res.json(found);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
const { className, schoolYear, homeroomTeachers } = req.body;
const formattedTeachers = Array.isArray(homeroomTeachers)
  ? homeroomTeachers
  : homeroomTeachers
  ? [homeroomTeachers]
  : [];

const updated = await ClassModel.findByIdAndUpdate(
  id,
  {
    className,
    schoolYear,
    homeroomTeachers: formattedTeachers,
  },
  { new: true }
);    if (!updated) {
      return res.status(404).json({ message: "Class not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ClassModel.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Class not found" });
    }
    return res.json({ message: "Class deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.bulkUploadClasses = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No Excel file uploaded" });
    }

    // Đọc file Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws); // Mỗi row là 1 object

    // Lấy tất cả SchoolYear và tạo map: { code: _id }
    const schoolYears = await SchoolYear.find({});
    const schoolYearMap = {};
    schoolYears.forEach((sy) => {
      if (sy.code) schoolYearMap[sy.code.trim()] = sy._id;
    });

    // Lấy tất cả giáo viên và tạo map theo email
    const users = await require("../../models/Users").find({});
    const userMap = {};
    users.forEach((u) => {
      if (u.email) userMap[u.email.trim()] = u._id;
    });

    const classesToInsert = [];

    rows.forEach((row) => {
      if (!row.ClassName || !row.SchoolYearCode) return;

      const schoolYearId = schoolYearMap[row.SchoolYearCode.trim()];
      if (!schoolYearId) return;

      let teacherIds = [];
      if (row.HomeroomTeachers) {
        teacherIds = row.HomeroomTeachers.split(",")
          .map((email) => email.trim())
          .map((email) => userMap[email])
          .filter(Boolean);
      }

      classesToInsert.push({
        className: row.ClassName.trim(),
        schoolYear: schoolYearId,
        homeroomTeachers: teacherIds,
      });
    });

    if (classesToInsert.length > 0) {
      // Lọc bỏ các lớp đã tồn tại dựa trên className và schoolYear
      const filteredClasses = [];
      for (const cls of classesToInsert) {
        const exists = await ClassModel.findOne({
          className: cls.className,
          schoolYear: cls.schoolYear,
        });
        if (!exists) {
          filteredClasses.push(cls);
        }
      }

      if (filteredClasses.length > 0) {
        await ClassModel.insertMany(filteredClasses);
        return res.json({
          message: `Bulk upload success! ${filteredClasses.length} lớp mới được thêm.`,
          count: filteredClasses.length,
        });
      } else {
        return res.json({
          message:
            "Bulk upload: Tất cả các lớp đã tồn tại trong hệ thống, không có lớp mới được thêm.",
          count: 0,
        });
      }
    } else {
      return res.json({
        message: "Không có dữ liệu hợp lệ trong file Excel.",
        count: 0,
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    // Optionally: fs.unlinkSync(req.file.path);
  }
};

const SchoolYear = require("../../models/SchoolYear"); // import model
async function findSchoolYearIdByCode(code) {
  if (!code) return null;
  const sy = await SchoolYear.findOne({ code });
  return sy ? sy._id : null;
}