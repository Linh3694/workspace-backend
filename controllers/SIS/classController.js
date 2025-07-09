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
const uploadClass = require("../../middleware/uploadClass");
const AdmZip = require("adm-zip");

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
    const { gradeLevels, schoolYear, school } = req.query;
    const { populate } = req.query;
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

    // Xử lý school - tìm grade levels của trường này
    if (school) {
      const GradeLevel = require("../../models/GradeLevel");
      const schoolGradeLevels = await GradeLevel.find({ school: new mongoose.Types.ObjectId(school) });
      const gradeIds = schoolGradeLevels.map(gl => gl._id);
      
      if (filter.gradeLevel) {
        // Nếu đã có filter gradeLevel, thì intersection
        filter.gradeLevel.$in = filter.gradeLevel.$in.filter(id => 
          gradeIds.some(gradeId => gradeId.toString() === id.toString())
        );
      } else {
        // Nếu chưa có filter gradeLevel, thì set filter cho tất cả grade của school
        filter.gradeLevel = { $in: gradeIds };
      }
    }

    // Xử lý schoolYear
    if (schoolYear) {
      filter.schoolYear = new mongoose.Types.ObjectId(schoolYear);
    }
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

    // Kiểm tra query param để xác định level populate
    const { populate } = req.query;
    
    let populateQuery = Class.findById(id)
      .populate('schoolYear')
      .populate('educationalSystem')
      .populate('curriculum')
      .populate('homeroomTeachers')
      .populate('students');

    // Nếu có request populate gradeLevel.school
    if (populate && populate.includes('gradeLevel.school')) {
      populateQuery = populateQuery.populate({
        path: 'gradeLevel',
        populate: {
          path: 'school'
        }
      });
    } else {
      populateQuery = populateQuery.populate('gradeLevel');
    }

    const classInfo = await populateQuery;

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
    if (!oldClass) {
      return res.status(404).json({ message: "Class not found" });
    }
    
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
    if (gradeLevel && oldGradeLevel && oldGradeLevel.toString() !== gradeLevel) {
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
    const oldTeacherIds = (oldClass.homeroomTeachers || []).map(id => id.toString());
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
    console.error('❌ [Class] Error updating class:', err);
    console.error('❌ [Class] Stack trace:', err.stack);
    return res.status(500).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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
    if (!req.file) {
      return res.status(400).json({ message: "Không có file Excel được upload" });
    }

    // Đọc file Excel từ buffer
    const xlsx = require('xlsx');
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu trong file Excel" });
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

// Upload ảnh cho lớp học
exports.uploadClassImage = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: "Không có file ảnh được upload" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID lớp không hợp lệ" });
    }

    // Kiểm tra lớp có tồn tại không
    const classExists = await Class.findById(id);
    if (!classExists) {
      return res.status(404).json({ message: "Không tìm thấy lớp học" });
    }

    // Cập nhật đường dẫn ảnh vào database
    const imagePath = `uploads/Classes/${req.file.filename}`;
    const updatedClass = await Class.findByIdAndUpdate(
      id,
      { classImage: imagePath, updatedAt: Date.now() },
      { new: true }
    ).populate('schoolYear')
     .populate('educationalSystem')
     .populate('gradeLevel')
     .populate({
       path: 'homeroomTeachers',
       populate: { path: 'user', select: 'fullname email' }
     });

    return res.json({ 
      message: "Upload ảnh lớp thành công", 
      data: updatedClass,
      imagePath: imagePath
    });
  } catch (err) {
    console.error('Error uploading class image:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Upload hàng loạt ảnh lớp từ file ZIP
exports.bulkUploadClassImages = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Không có file ZIP được upload" });
    }

    const { schoolYear } = req.body;
    if (!schoolYear) {
      return res.status(400).json({ message: "Thiếu thông tin năm học" });
    }

    // Kiểm tra năm học có tồn tại
    const schoolYearRecord = await SchoolYear.findById(schoolYear);
    if (!schoolYearRecord) {
      return res.status(400).json({ message: "Năm học không tồn tại" });
    }

    const zipPath = req.file.path;
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    const results = {
      success: [],
      errors: [],
      total: 0
    };

    // Lọc ra các file hợp lệ
    const validEntries = zipEntries.filter(entry => {
      if (entry.isDirectory) return false;
      
      const fileName = entry.entryName;
      
      // Bỏ qua file __MACOSX và hidden files
      if (fileName.includes('__MACOSX') || 
          fileName.includes('._') || 
          fileName.startsWith('.') ||
          fileName.includes('/.')) {
        return false;
      }
      
      const fileExt = fileName.toLowerCase().split('.').pop();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
    });

    results.total = validEntries.length;

    for (const entry of validEntries) {
      try {
        const fileName = entry.entryName;
        const fileExt = fileName.toLowerCase().split('.').pop();
        
        // Parse tên file với nhiều định dạng khác nhau
        let className = '';
        let targetSchoolYearCode = '';
        
        // Lấy tên file cuối cùng từ path
        const pathParts = fileName.split('/');
        const fileNameOnly = pathParts[pathParts.length - 1];
        const baseFileName = fileNameOnly.split('.')[0];
        
        // Định dạng 1: className_schoolYearCode.ext
        if (baseFileName.includes('_')) {
          const parts = baseFileName.split('_');
          className = parts[0];
          targetSchoolYearCode = parts.slice(1).join('_'); // Trong trường hợp năm học có dạng 2024-2025
        }
        // Định dạng 2: schoolYear/className.ext (file trong thư mục năm học)
        else if (pathParts.length > 1) {
          // Kiểm tra xem thư mục có phải là năm học không
          const folderName = pathParts[pathParts.length - 2];
          if (folderName && folderName.match(/^\d{4}-\d{4}$/)) {
            className = baseFileName;
            targetSchoolYearCode = folderName;
          } else {
            className = baseFileName;
            targetSchoolYearCode = schoolYearRecord.code;
          }
        }
        // Định dạng 3: className.ext (chỉ có tên lớp)
        else {
          className = baseFileName;
          targetSchoolYearCode = schoolYearRecord.code;
        }

        if (!className) {
          results.errors.push(`File ${fileName}: Không thể parse tên lớp`);
          continue;
        }

        // Tìm lớp học theo className và schoolYear
        // Nếu có targetSchoolYearCode, tìm theo đó, không thì dùng schoolYear từ request
        let classRecord;
        
        if (targetSchoolYearCode && targetSchoolYearCode !== schoolYearRecord.code) {
          // Tìm năm học theo code
          const targetSchoolYear = await SchoolYear.findOne({ code: targetSchoolYearCode });
          if (!targetSchoolYear) {
            results.errors.push(`File ${fileName}: Không tìm thấy năm học ${targetSchoolYearCode}`);
            continue;
          }
          classRecord = await Class.findOne({ 
            className: className, 
            schoolYear: targetSchoolYear._id 
          });
        } else {
          classRecord = await Class.findOne({ 
            className: className, 
            schoolYear: schoolYear 
          });
        }
        
        if (!classRecord) {
          results.errors.push(`File ${fileName}: Không tìm thấy lớp ${className} trong năm học ${targetSchoolYearCode || schoolYearRecord.code}`);
          continue;
        }

        // Trích xuất và lưu file
        const timestamp = Date.now();
        const sanitizedClassName = className.replace(/[^a-zA-Z0-9]/g, '');
        const sanitizedSchoolYear = (targetSchoolYearCode || schoolYearRecord.code).replace(/[^a-zA-Z0-9]/g, '');
        const newFileName = `class-${timestamp}-${sanitizedClassName}-${sanitizedSchoolYear}.${fileExt}`;
        const outputPath = `uploads/Classes/${newFileName}`;

        // Tạo thư mục nếu chưa tồn tại
        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(__dirname, '../../uploads/Classes');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Trích xuất file từ ZIP
        const fileContent = zip.readFile(entry);
        const fullOutputPath = path.join(uploadDir, newFileName);
        fs.writeFileSync(fullOutputPath, fileContent);

        // Cập nhật database
        await Class.findByIdAndUpdate(
          classRecord._id,
          { classImage: outputPath, updatedAt: Date.now() }
        );

        results.success.push(`${className} (${targetSchoolYearCode || schoolYearRecord.code}): Upload thành công`);

      } catch (entryError) {
        console.error(`Error processing ${entry.entryName}:`, entryError);
        results.errors.push(`File ${entry.entryName}: ${entryError.message}`);
      }
    }

    // Xóa file ZIP tạm
    const fs = require('fs');
    try {
      fs.unlinkSync(zipPath);
    } catch (cleanupError) {
      console.error('Error cleaning up ZIP file:', cleanupError);
    }

    return res.json({
      message: `Xử lý hoàn tất: ${results.success.length} thành công, ${results.errors.length} lỗi`,
      results: results
    });

  } catch (err) {
    console.error('Error in bulk upload class images:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createClass: exports.createClass,
  getAllClasses: exports.getAllClasses,
  getClassById: exports.getClassById,
  updateClass: exports.updateClass,
  deleteClass: exports.deleteClass,
  bulkUploadClasses: exports.bulkUploadClasses,
  uploadClassImage: exports.uploadClassImage,
  bulkUploadClassImages: exports.bulkUploadClassImages
};