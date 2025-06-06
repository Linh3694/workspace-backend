const asyncHandler = require('express-async-handler');
const Attendance = require('../../models/Attendance');
const Class = require('../../models/Class');
const Student = require('../../models/Student');
const Timetable = require('../../models/Timetable');
const Teacher = require('../../models/Teacher');

// Display list of all Attendances
exports.getAttendances = asyncHandler(async (req, res) => {
  const { class: classId, date } = req.query;
  let filter = {};
  if (classId) filter.class = classId;
  if (date) filter.date = date;
  const attendances = await Attendance.find(filter).populate('student class teacher');
  res.json(attendances);
});

// Get a single Attendance by ID
exports.getAttendanceById = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id).populate('student class');
  if (!attendance) {
    return res.status(404).json({ message: 'Attendance not found' });
  }
  res.json(attendance);
});

// Create a new Attendance
exports.createAttendance = asyncHandler(async (req, res) => {
  const attendance = new Attendance(req.body);
  const newAttendance = await attendance.save();
  res.status(201).json(newAttendance);
});

// Update a Attendance
exports.updateAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!attendance) {
    return res.status(404).json({ message: 'Attendance not found' });
  }
  res.json(attendance);
});

// Delete a Attendance
exports.deleteAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findByIdAndDelete(req.params.id);
  if (!attendance) {
    return res.status(404).json({ message: 'Attendance not found' });
  }
  res.json({ message: 'Attendance deleted successfully' });
});

// API: Lấy danh sách lớp theo role
exports.getClassesByRole = asyncHandler(async (req, res) => {
  const { role, teacherId } = req.query;
  let classes = [];
  if (role === 'admin') {
    classes = await Class.find().populate('homeroomTeachers', 'fullname');
  } else if (role === 'teacher' && teacherId) {
    // Lấy lớp chủ nhiệm
    const homeroomClasses = await Class.find({ homeroomTeachers: teacherId });
    // Lấy lớp có tiết dạy
    const teachingAssignments = await Teacher.findById(teacherId).select('teachingAssignments');
    let teachingClassIds = [];
    if (teachingAssignments && teachingAssignments.teachingAssignments) {
      teachingClassIds = teachingAssignments.teachingAssignments.map(a => a.class);
    }
    const teachingClasses = await Class.find({ _id: { $in: teachingClassIds } });
    // Gộp và loại trùng
    const allClasses = [...homeroomClasses, ...teachingClasses];
    const uniqueClasses = Array.from(new Map(allClasses.map(item => [item._id.toString(), item])).values());
    classes = uniqueClasses;
  }
  res.json(classes);
});

// API: Lấy danh sách học sinh theo classId
exports.getStudentsByClass = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ message: 'Missing classId' });
  const students = await Student.find({ class: classId });
  res.json(students);
});