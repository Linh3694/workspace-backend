const asyncHandler = require('express-async-handler');
const Attendance = require('../../models/Attendance');
const Class = require('../../models/Class');
const Student = require('../../models/Student');
const Timetable = require('../../models/Timetable');
const Teacher = require('../../models/Teacher');
const TimeAttendance = require('../../models/TimeAttendance');

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

// API: Lấy dữ liệu timeAttendance cho học sinh theo ngày
exports.getTimeAttendanceByDate = asyncHandler(async (req, res) => {
  const { date, studentCodes } = req.query;
  
  if (!date) {
    return res.status(400).json({ message: 'Missing date parameter' });
  }

  // Parse date và tạo range cho ngày đó
  const queryDate = new Date(date);
  queryDate.setHours(0, 0, 0, 0);
  
  const nextDay = new Date(queryDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Build filter
  const filter = {
    date: {
      $gte: queryDate,
      $lt: nextDay
    }
  };

  // Nếu có studentCodes, filter theo employeeCode (vì timeAttendance dùng employeeCode)
  if (studentCodes) {
    const codes = Array.isArray(studentCodes) ? studentCodes : studentCodes.split(',');
    filter.employeeCode = { $in: codes };
  }

  try {
    const timeAttendanceRecords = await TimeAttendance.find(filter)
      .select('employeeCode date firstCheckIn lastCheckOut totalCheckIns rawData')
      .lean();

    // Process data để lấy check-in đầu tiên và check-out cuối cùng
    const processedData = {};
    
    timeAttendanceRecords.forEach(record => {
      const studentCode = record.employeeCode;
      
      // Tìm check-in đầu tiên và check-out cuối cùng từ rawData
      let firstCheckIn = null;
      let lastCheckOut = null;
      
      if (record.rawData && record.rawData.length > 0) {
        // Sort rawData theo timestamp
        const sortedData = record.rawData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Lấy check-in đầu tiên
        firstCheckIn = sortedData[0].timestamp;
        
        // Lấy check-out cuối cùng (nếu có nhiều hơn 1 record)
        if (sortedData.length > 1) {
          lastCheckOut = sortedData[sortedData.length - 1].timestamp;
        }
      } else {
        // Fallback to firstCheckIn/lastCheckOut fields if rawData not available
        firstCheckIn = record.firstCheckIn;
        lastCheckOut = record.lastCheckOut;
      }
      
      processedData[studentCode] = {
        studentCode,
        checkIn: firstCheckIn ? new Date(firstCheckIn).toTimeString().slice(0, 5) : null, // Format HH:MM
        checkOut: lastCheckOut ? new Date(lastCheckOut).toTimeString().slice(0, 5) : null,
        totalCheckIns: record.totalCheckIns || 0
      };
    });

    res.json(processedData);
  } catch (error) {
    console.error('Error fetching time attendance:', error);
    res.status(500).json({ message: 'Error fetching time attendance data' });
  }
});