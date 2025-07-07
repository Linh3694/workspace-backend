const mongoose = require("mongoose");
const TimetableSchedule = require("../../models/TimetableSchedule");
const SchoolYear = require("../../models/SchoolYear");
const Class = require("../../models/Class");
const Users = require("../../models/Users");
const Timetable = require("../../models/Timetable");

// Lấy tất cả thời khoá biểu theo lớp
exports.getTimetableSchedules = async (req, res) => {
  try {
    const { schoolYearId, classId } = req.query;

    if (!schoolYearId || !classId) {
      return res.status(400).json({ message: "Thiếu thông tin năm học hoặc lớp" });
    }

    const schedules = await TimetableSchedule.find({
      schoolYear: schoolYearId,
      class: classId
    })
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("createdBy", "fullname")
      .sort({ createdAt: -1 });

    return res.json(schedules);
  } catch (err) {
    console.error("Error getting timetable schedules:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Tạo thời khoá biểu mới
exports.createTimetableSchedule = async (req, res) => {
  try {
    const { name, schoolYear, class: classId, startDate, endDate } = req.body;
    const createdBy = req.user?._id;

    // Validate input
    if (!name || !schoolYear || !classId || !startDate || !endDate) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      return res.status(400).json({ message: "Ngày kết thúc phải sau ngày bắt đầu" });
    }

    // Kiểm tra xung đột thời gian cho lớp học
    const conflictingSchedule = await TimetableSchedule.findOne({
      class: classId,
      schoolYear: schoolYear,
      status: "active",
      $or: [
        {
          $and: [
            { startDate: { $lte: start } },
            { endDate: { $gt: start } }
          ]
        },
        {
          $and: [
            { startDate: { $lt: end } },
            { endDate: { $gte: end } }
          ]
        },
        {
          $and: [
            { startDate: { $gte: start } },
            { endDate: { $lte: end } }
          ]
        }
      ]
    });

    if (conflictingSchedule) {
      return res.status(400).json({ 
        message: "Đã có thời khoá biểu khác trong khoảng thời gian này" 
      });
    }

    // Tạo thời khoá biểu mới
    const newSchedule = new TimetableSchedule({
      name,
      schoolYear,
      class: classId,
      startDate: start,
      endDate: end,
      createdBy
    });

    await newSchedule.save();

    const savedSchedule = await TimetableSchedule.findById(newSchedule._id)
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("createdBy", "fullname");

    return res.status(201).json({
      message: "Tạo thời khoá biểu thành công",
      schedule: savedSchedule
    });
  } catch (err) {
    console.error("Error creating timetable schedule:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Cập nhật thời khoá biểu
exports.updateTimetableSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const schedule = await TimetableSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: "Không tìm thấy thời khoá biểu" });
    }

    // Validate dates if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start >= end) {
        return res.status(400).json({ message: "Ngày kết thúc phải sau ngày bắt đầu" });
      }

      // Kiểm tra xung đột thời gian (trừ chính nó)
      const conflictingSchedule = await TimetableSchedule.findOne({
        _id: { $ne: id },
        class: schedule.class,
        schoolYear: schedule.schoolYear,
        status: "active",
        $or: [
          {
            $and: [
              { startDate: { $lte: start } },
              { endDate: { $gt: start } }
            ]
          },
          {
            $and: [
              { startDate: { $lt: end } },
              { endDate: { $gte: end } }
            ]
          },
          {
            $and: [
              { startDate: { $gte: start } },
              { endDate: { $lte: end } }
            ]
          }
        ]
      });

      if (conflictingSchedule) {
        return res.status(400).json({ 
          message: "Đã có thời khoá biểu khác trong khoảng thời gian này" 
        });
      }
    }

    // Cập nhật thông tin
    const updateData = {};
    if (name) updateData.name = name;
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (status) updateData.status = status;

    const updatedSchedule = await TimetableSchedule.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("createdBy", "fullname");

    return res.json({
      message: "Cập nhật thời khoá biểu thành công",
      schedule: updatedSchedule
    });
  } catch (err) {
    console.error("Error updating timetable schedule:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Xóa thời khoá biểu
exports.deleteTimetableSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    // Xoá schedule
    const deleted = await TimetableSchedule.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy thời khoá biểu" });
    }

    // Xoá tất cả slot timetable liên quan
    const deletedSlots = await Timetable.deleteMany({ scheduleId: id });

    return res.json({
      message: "Xoá thời khoá biểu thành công",
      deletedSlots: deletedSlots.deletedCount
    });
  } catch (err) {
    console.error("Error deleting timetable schedule:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Lấy thời khoá biểu theo ID
exports.getTimetableScheduleById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const schedule = await TimetableSchedule.findById(id)
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("createdBy", "fullname");

    if (!schedule) {
      return res.status(404).json({ message: "Không tìm thấy thời khoá biểu" });
    }

    return res.json(schedule);
  } catch (err) {
    console.error("Error getting timetable schedule by ID:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Upload file cho thời khoá biểu
exports.uploadTimetableFile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Không có file được upload" });
    }

    const fileUrl = `/uploads/Timetables/${req.file.filename}`;
    const fileName = req.file.originalname;

    const updatedSchedule = await TimetableSchedule.findByIdAndUpdate(
      id,
      { fileUrl, fileName },
      { new: true }
    )
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("createdBy", "fullname");

    if (!updatedSchedule) {
      return res.status(404).json({ message: "Không tìm thấy thời khoá biểu" });
    }

    return res.json({
      message: "Upload file thành công",
      schedule: updatedSchedule
    });
  } catch (err) {
    console.error("Error uploading timetable file:", err);
    return res.status(500).json({ error: err.message });
  }
}; 