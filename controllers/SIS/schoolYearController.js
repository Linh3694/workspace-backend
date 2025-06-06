const mongoose = require("mongoose");
const SchoolYear = require("../../models/SchoolYear");
const Class = require("../../models/Class");
const Timetable = require("../../models/Timetable");
const xlsx = require("xlsx");

// Tạo năm học mới
exports.createSchoolYear = async (req, res) => {
  try {
    const { code, startDate, endDate, isActive } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!code || !startDate || !endDate) {
      return res.status(400).json({ message: "Code, startDate, and endDate are required" });
    }

    // Kiểm tra trùng code
    const existingSchoolYear = await SchoolYear.findOne({ code });
    if (existingSchoolYear) {
      return res.status(400).json({ message: "School year code already exists" });
    }

    // Nếu đặt isActive = true, bỏ active của các năm học khác
    if (isActive) {
      await SchoolYear.updateMany({}, { isActive: false });
    }

    const newSchoolYear = await SchoolYear.create({
      code,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive || false,
    });

    return res.status(201).json(newSchoolYear);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy tất cả năm học
exports.getAllSchoolYears = async (req, res) => {
  try {
    const schoolYears = await SchoolYear.find().sort({ startDate: -1 });
    return res.json({ data: schoolYears });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy năm học theo ID
exports.getSchoolYearById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid school year ID" });
    }
    const schoolYear = await SchoolYear.findById(id);
    if (!schoolYear) {
      return res.status(404).json({ message: "School year not found" });
    }
    return res.json(schoolYear);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Cập nhật năm học
exports.updateSchoolYear = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, startDate, endDate, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid school year ID" });
    }

    // Kiểm tra trùng code (nếu thay đổi code)
    if (code) {
      const existingSchoolYear = await SchoolYear.findOne({ code, _id: { $ne: id } });
      if (existingSchoolYear) {
        return res.status(400).json({ message: "School year code already exists" });
      }
    }

    // Nếu đặt isActive = true, bỏ active của các năm học khác
    if (isActive) {
      await SchoolYear.updateMany({ _id: { $ne: id } }, { isActive: false });
    }

    const updatedSchoolYear = await SchoolYear.findByIdAndUpdate(
      id,
      {
        code,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        updatedAt: Date.now(),
      },
      { new: true, omitUndefined: true }
    );

    if (!updatedSchoolYear) {
      return res.status(404).json({ message: "School year not found" });
    }

    return res.json(updatedSchoolYear);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Xóa năm học
exports.deleteSchoolYear = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid school year ID" });
    }

    // Kiểm tra ràng buộc: Không xóa nếu năm học có lớp hoặc thời khóa biểu
    const classes = await Class.find({ schoolYear: id });
    if (classes.length > 0) {
      return res.status(400).json({ message: "Cannot delete school year with associated classes" });
    }
    const timetables = await Timetable.find({ schoolYear: id });
    if (timetables.length > 0) {
      return res.status(400).json({ message: "Cannot delete school year with associated timetables" });
    }

    const deletedSchoolYear = await SchoolYear.findByIdAndDelete(id);
    if (!deletedSchoolYear) {
      return res.status(404).json({ message: "School year not found" });
    }

    return res.json({ message: "School year deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy năm học hiện tại
exports.getCurrentSchoolYear = async (req, res) => {
  try {
    const currentSchoolYear = await SchoolYear.findOne({ isActive: true });
    if (!currentSchoolYear) {
      return res.status(404).json({ message: "No active school year found" });
    }
    return res.json(currentSchoolYear);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Nhập hàng loạt năm học từ Excel
exports.bulkUploadSchoolYears = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Đọc file Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const schoolYearsToInsert = [];
    const errors = [];

    for (const row of rows) {
      const { Code, StartDate, EndDate, IsActive } = row;

      // Kiểm tra dữ liệu
      if (!Code || !StartDate || !EndDate) {
        errors.push(`Invalid data in row: ${JSON.stringify(row)}`);
        continue;
      }

      // Kiểm tra trùng code
      const existingSchoolYear = await SchoolYear.findOne({ code: Code });
      if (existingSchoolYear) {
        errors.push(`Duplicate code: ${Code}`);
        continue;
      }

      schoolYearsToInsert.push({
        code: Code,
        startDate: new Date(StartDate),
        endDate: new Date(EndDate),
        isActive: IsActive === true || IsActive === "true" || IsActive === 1,
      });
    }

    // Nếu có bản ghi isActive = true, bỏ active của các năm học hiện có
    if (schoolYearsToInsert.some((sy) => sy.isActive)) {
      await SchoolYear.updateMany({}, { isActive: false });
    }

    // Thêm vào database
    if (schoolYearsToInsert.length > 0) {
      await SchoolYear.insertMany(schoolYearsToInsert);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: `Imported ${schoolYearsToInsert.length} school years with ${errors.length} errors`,
        errors,
      });
    }

    return res.json({ message: `Imported ${schoolYearsToInsert.length} school years successfully` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createSchoolYear: exports.createSchoolYear,
  getAllSchoolYears: exports.getAllSchoolYears,
  getSchoolYearById: exports.getSchoolYearById,
  updateSchoolYear: exports.updateSchoolYear,
  deleteSchoolYear: exports.deleteSchoolYear,
  getCurrentSchoolYear: exports.getCurrentSchoolYear,
  bulkUploadSchoolYears: exports.bulkUploadSchoolYears
};