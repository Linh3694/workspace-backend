// controllers/timetableController.js
const Timetable = require("../../models/Timetable");

// Tạo thời khóa biểu mới
exports.createTimetable = async (req, res) => {
  try {
    const { schoolYear, class: classId, subject, teacher, room, timeSlot } = req.body;
    // Kiểm tra xung đột
    const conflict = await Timetable.findOne({
      schoolYear,
      class: classId,
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          "timeSlot.startTime": { $lte: timeSlot.endTime },
          "timeSlot.endTime": { $gte: timeSlot.startTime },
        },
      ],
    });
    if (conflict) {
      return res.status(400).json({ message: "Time slot conflict" });
    }
    const newTimetable = await Timetable.create({
      schoolYear,
      class: classId,
      subject,
      teacher,
      room,
      timeSlot,
    });
    return res.status(201).json(newTimetable);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy thời khóa biểu của lớp
exports.getTimetableByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const timetable = await Timetable.find({ class: classId })
      .populate("schoolYear")
      .populate("subject")
      .populate("teacher")
      .populate("room");
    return res.json(timetable);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Lấy thời khóa biểu của giáo viên
exports.getTimetableByTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const timetable = await Timetable.find({ teacher: teacherId })
      .populate("schoolYear")
      .populate("class")
      .populate("subject")
      .populate("room");
    return res.json(timetable);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật thời khóa biểu
exports.updateTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Timetable.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Timetable not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Xóa thời khóa biểu
exports.deleteTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Timetable.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Timetable not found" });
    }
    return res.json({ message: "Timetable deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

// Nhập hàng loạt thời khóa biểu từ Excel
exports.bulkUploadTimetable = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const timetableToInsert = [];
    for (const row of rows) {
      const schoolYear = await SchoolYear.findOne({ code: row.SchoolYearCode });
      const classObj = await Class.findOne({ className: row.ClassName, schoolYear: schoolYear?._id });
      const subject = await Subject.findOne({ name: row.Subject });
      const teacher = await Teacher.findOne({ email: row.TeacherEmail });
      const room = await Room.findOne({ name: row.Room });
      if (!schoolYear || !classObj || !subject || !teacher || !room) continue;
      timetableToInsert.push({
        schoolYear: schoolYear._id,
        class: classObj._id,
        subject: subject._id,
        teacher: teacher._id,
        room: room._id,
        timeSlot: {
          dayOfWeek: row.DayOfWeek,
          startTime: row.StartTime,
          endTime: row.EndTime,
        },
      });
    }

    if (timetableToInsert.length > 0) {
      await Timetable.insertMany(timetableToInsert);
      return res.json({ message: `Added ${timetableToInsert.length} timetable entries` });
    }
    return res.json({ message: "No valid data found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};