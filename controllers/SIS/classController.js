const mongoose = require("mongoose");
const SchoolYear = require("../../models/SchoolYear");
const Class = require("../../models/Class");
const EducationalSystem = require("../../models/EducationalSystem");
const Curriculum = require("../../models/Curriculum");
const Student = require("../../models/Student");
const Timetable = require("../../models/Timetable");
const StudentClassEnrollment = require("../../models/StudentClassEnrollment");
const GradeLevel = require("../../models/GradeLevel");
const Teacher = require("../../models/Teacher");

const xlsx = require("xlsx");

// Tạo lớp học mới
exports.createClass = async (req, res) => {
  try {
    const { className, schoolYear, educationalSystem, gradeLevel, homeroomTeachers } = req.body;

    if (!className || !schoolYear || !educationalSystem || !gradeLevel) {
      return res.status(400).json({ message: "Class name, school year, grade level and educational system are required" });
    }

    // Kiểm tra gradeLevel có tồn tại
    const gradeLevelExists = await GradeLevel.findById(gradeLevel);
    if (!gradeLevelExists) {
      return res.status(400).json({ message: "Grade level not found" });
    }

    // Tìm curriculum của educationalSystem
    const curriculum = await Curriculum.findOne({ educationalSystem });
    if (!curriculum) {
      return res.status(400).json({ message: "No curriculum found for this educational system" });
    }

    // Kiểm tra và lấy thông tin đầy đủ của giáo viên
    let validTeachers = [];
    if (homeroomTeachers && homeroomTeachers.length > 0) {
      validTeachers = await Teacher.find({
        _id: { $in: homeroomTeachers }
      }).populate('user', 'fullname email');

      if (validTeachers.length !== homeroomTeachers.length) {
        return res.status(400).json({ message: "One or more teachers not found" });
      }
    }

    const newClass = await Class.create({
      className,
      schoolYear,
      educationalSystem,
      curriculum: curriculum._id,
      gradeLevel,
      homeroomTeachers: validTeachers.map(t => t._id)
    });

    // Cập nhật GradeLevel với lớp mới
    await GradeLevel.findByIdAndUpdate(
      gradeLevel,
      { $addToSet: { classes: newClass._id } }
    );

    // Populate đầy đủ thông tin trước khi trả về
    const populatedClass = await Class.findById(newClass._id)
      .populate('schoolYear')
      .populate('educationalSystem')
      .populate('curriculum')
      .populate('gradeLevel')
      .populate({
        path: 'homeroomTeachers',
        select: 'fullname email phone user',
        populate: {
          path: 'user',
          select: 'fullname email'
        }
      });

    // Cập nhật danh sách lớp học cho các giáo viên
    if (validTeachers.length > 0) {
      await Teacher.updateMany(
        { _id: { $in: validTeachers.map(t => t._id) } },
        { $addToSet: { classes: newClass._id } }
      );
    }

    return res.status(201).json({ data: populatedClass });
  } catch (err) {
    console.error('Error in createClass:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Lấy tất cả lớp học
exports.getAllClasses = async (req, res) => {
  try {
    const { gradeLevels, schoolYear } = req.query;
    const { populate } = req.query;
    console.log("GET /classes - Query params:", { gradeLevels, schoolYear, populate });

    const filter = {};

    // Xử lý gradeLevel
    if (gradeLevels) {
      const gradeIdList = gradeLevels.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
      if (gradeIdList.length === 0) {
        return res.status(400).json({ message: "No valid grade level IDs provided" });
      }

      filter.gradeLevel = {
        $in: gradeIdList.map(id => new mongoose.Types.ObjectId(id))
      };
    }

    // Xử lý schoolYear
    if (schoolYear) {
      filter.schoolYear = new mongoose.Types.ObjectId(schoolYear);
    }

    console.log("Final filter:", filter);

    // Xây dựng populate path dựa trên tham số populate
    let query = Class.find(filter);

    if (populate) {
      const populateFields = populate.split(',');
      populateFields.forEach(field => {
        if (field === 'homeroomTeachers.user') {
          query = query.populate({
            path: 'homeroomTeachers',
            populate: {
              path: 'user',
              select: 'fullname email'
            }
          });
        } else {
          query = query.populate(field);
        }
      });
    } else {
      // Mặc định populate các trường cần thiết
      query = query
        .populate('schoolYear', 'code')
        .populate('educationalSystem', 'name')
        .populate('curriculum', 'name')
        .populate('gradeLevel', 'name code')
        .populate({
          path: 'homeroomTeachers',
          select: 'fullname email phone user',
          populate: {
            path: 'user',
            select: 'fullname email'
          }
        })
        .populate('students', 'name');
    }

    const classes = await query.sort({ className: 1 });

    // Log để debug
    console.log("Classes found:", JSON.stringify(classes, null, 2));

    return res.json({ data: classes });
  } catch (err) {
    console.error("Error fetching classes:", err);
    return res.status(500).json({ message: err.message });
  }
};

// Lấy lớp học theo ID
exports.getClassById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const classInfo = await Class.findById(id)
      .populate('schoolYear')
      .populate('educationalSystem')
      .populate('curriculum')
      .populate('homeroomTeachers')
      .populate('students');

    if (!classInfo) {
      return res.status(404).json({ message: "Class not found" });
    }

    return res.json(classInfo);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Cập nhật lớp học
exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { className, schoolYear, educationalSystem, curriculum, gradeLevel, homeroomTeachers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // Lấy thông tin lớp cũ để kiểm tra thay đổi khối
    const oldClass = await Class.findById(id);
    const oldGradeLevel = oldClass.gradeLevel;

    const updatedClass = await Class.findByIdAndUpdate(
      id,
      {
        className,
        schoolYear,
        educationalSystem,
        curriculum,
        gradeLevel,
        homeroomTeachers,
        updatedAt: Date.now()
      },
      { new: true, omitUndefined: true }
    )
      .populate('schoolYear')
      .populate('educationalSystem')
      .populate('curriculum')
      .populate({
        path: 'homeroomTeachers',
        select: 'fullname email phone user',
        populate: {
          path: 'user',
          select: 'fullname email'
        }
      });

    if (!updatedClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Nếu có thay đổi khối, cập nhật lại references
    if (gradeLevel && oldGradeLevel.toString() !== gradeLevel) {
      // Xóa reference từ khối cũ
      await GradeLevel.findByIdAndUpdate(
        oldGradeLevel,
        { $pull: { classes: id } }
      );

      // Thêm reference vào khối mới
      await GradeLevel.findByIdAndUpdate(
        gradeLevel,
        { $addToSet: { classes: id } }
      );
    }

    // Sync homeroom teacher 'classes' arrays
    const newTeacherIds = homeroomTeachers || [];
    const oldTeacherIds = oldClass.homeroomTeachers.map(id => id.toString());

    // Teachers removed from homeroom: pull the class
    const removed = oldTeacherIds.filter(id => !newTeacherIds.includes(id));
    if (removed.length) {
      await Teacher.updateMany(
        { _id: { $in: removed } },
        { $pull: { classes: id } }
      );
    }

    // Teachers newly added as homeroom: add the class
    const added = newTeacherIds.filter(id => !oldTeacherIds.includes(id));
    if (added.length) {
      await Teacher.updateMany(
        { _id: { $in: added } },
        { $addToSet: { classes: id } }
      );
    }

    return res.json({ data: updatedClass });
  } catch (err) {
    console.error('Error updating class:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Xóa lớp học
exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const classToDelete = await Class.findById(id);
    if (!classToDelete) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Xóa reference từ GradeLevel
    await GradeLevel.findByIdAndUpdate(
      classToDelete.gradeLevel,
      { $pull: { classes: id } }
    );

    // Xóa lớp
    await Class.findByIdAndDelete(id);

    return res.json({ message: "Class deleted successfully" });
  } catch (err) {
    console.error('Error deleting class:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Nhập hàng loạt lớp học từ Excel
exports.bulkUploadClasses = async (req, res) => {
  try {
    const data = req.body;  
    if (!data || data.length === 0) {
      return res.status(400).json({ message: "No data found in Excel file" });
    }

    const classesToInsert = [];
    const errors = [];

    for (const row of data) {
      const { ClassName, SchoolYearCode, EducationalSystemName, GradeLevelCode, HomeroomTeacherEmails } = row;

      // Kiểm tra dữ liệu bắt buộc
      if (!ClassName || !SchoolYearCode || !GradeLevelCode) {
        errors.push(`Missing ClassName, SchoolYearCode or GradeLevelCode in row: ${JSON.stringify(row)}`);
        continue;
      }

      // Tìm schoolYear
      const schoolYear = await SchoolYear.findOne({ code: SchoolYearCode });
      if (!schoolYear) {
        errors.push(`School year not found for code: ${SchoolYearCode}`);
        continue;
      }

      // Tìm educationalSystem (nếu có)
      let educationalSystem = null;
      if (EducationalSystemName) {
        educationalSystem = await EducationalSystem.findOne({ name: EducationalSystemName });
        if (!educationalSystem) {
          errors.push(`Educational system not found: ${EducationalSystemName}`);
          continue;
        }
      }

      // Tìm gradeLevel
      const gradeLevelRec = await GradeLevel.findOne({
        $or: [
          { code: GradeLevelCode },
          { name: GradeLevelCode }
        ]
      });
      if (!gradeLevelRec) {
        errors.push(`Grade level not found for code or name: ${GradeLevelCode}`);
        continue;
      }

      // Tìm curriculum (nếu có)
      let curriculum = null;
      if (typeof row.CurriculumGrade === 'string') {
        curriculum = await Curriculum.findOne({ gradeLevel: row.CurriculumGrade });
        if (!curriculum) {
          errors.push(`Curriculum not found for grade: ${row.CurriculumGrade}`);
          continue;
        }
      }

      // Tìm homeroomTeachers (nếu có)
      let homeroomTeachers = [];
      if (HomeroomTeacherEmails) {
        const emails = HomeroomTeacherEmails.split(",").map((e) => e.trim());
        for (const email of emails) {
          const teacher = await Teacher.findOne({ email });
          if (!teacher) {
            errors.push(`Teacher not found for email: ${email}`);
            continue;
          }
          homeroomTeachers.push(teacher._id);
        }
      }

      // Kiểm tra trùng className trong schoolYear
      const existingClass = await Class.findOne({ className: ClassName, schoolYear: schoolYear._id });
      if (existingClass) {
        errors.push(`Class already exists: ${ClassName} in school year ${SchoolYearCode}`);
        continue;
      }

      classesToInsert.push({
        className: ClassName,
        schoolYear: schoolYear._id,
        educationalSystem: educationalSystem?._id,
        curriculum: curriculum?._id,
        gradeLevel: gradeLevelRec._id,
        homeroomTeachers,
      });
    }

    // Thêm vào database
    if (classesToInsert.length > 0) {
      const insertedClasses = await Class.insertMany(classesToInsert);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        insertedCount: classesToInsert.length,
        errors,
        message: `Imported ${classesToInsert.length} classes with ${errors.length} errors`
      });
    }

    return res.json({ message: `Imported ${classesToInsert.length} classes successfully` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createClass: exports.createClass,
  getAllClasses: exports.getAllClasses,
  getClassById: exports.getClassById,
  updateClass: exports.updateClass,
  deleteClass: exports.deleteClass,
  bulkUploadClasses: exports.bulkUploadClasses
};