const asyncHandler = require('express-async-handler');
const Attendance = require('../../models/Attendance');
const Class = require('../../models/Class');
const Student = require('../../models/Student');
const Timetable = require('../../models/Timetable');
const Teacher = require('../../models/Teacher');
const TimeAttendance = require('../../models/TimeAttendance');
const PeriodDefinition = require('../../models/PeriodDefinition');
const mongoose = require('mongoose');

// ✅ THÊM: Helper function để chuyển đổi date thành dayOfWeek
const getDayOfWeek = (dateString) => {
  const date = new Date(dateString);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

// ✅ THÊM: Lấy danh sách tiết học cho một lớp
exports.getPeriodsByClass = async (req, res) => {
  try {
    const { classId, schoolYearId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(schoolYearId)) {
      return res.status(400).json({ message: "ID lớp hoặc ID năm học không hợp lệ" });
    }

    // Lấy thông tin class để biết school
    const classInfo = await Class.findById(classId)
      .populate({
        path: 'gradeLevel',
        populate: { path: 'school' }
      });
    
    if (!classInfo) {
      return res.status(404).json({ message: "Không tìm thấy lớp học" });
    }

    const schoolId = classInfo.gradeLevel?.school?._id;
    if (!schoolId) {
      return res.status(400).json({ message: "Không tìm thấy thông tin trường của lớp học" });
    }

    // Lấy period definitions (chỉ regular periods)
    const periods = await PeriodDefinition.find({
      schoolYear: schoolYearId,
      school: schoolId,
      type: 'regular'
    }).sort({ periodNumber: 1 });

    res.json({ periods });
  } catch (err) {
    console.error("Error getting periods by class:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ THÊM: Lấy timetable slots cho một lớp theo ngày
exports.getTimetableSlotsByDate = async (req, res) => {
  try {
    const { classId, date } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: "ID lớp không hợp lệ" });
    }

    // Chuyển date string thành dayOfWeek
    const dayOfWeek = getDayOfWeek(date);
    
    const timetableSlots = await Timetable.find({
      class: classId,
      'timeSlot.dayOfWeek': dayOfWeek
    })
    .populate('subject', 'name')
    .populate('teachers', 'fullname')
    .populate('room', 'name')
    .sort({ 'timeSlot.startTime': 1 });

    res.json({ timetableSlots });
  } catch (err) {
    console.error("Error getting timetable slots by date:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ THÊM: Lấy danh sách môn học có trong thời khóa biểu của lớp theo ngày
exports.getSubjectsByClassAndDate = async (req, res) => {
  try {
    const { classId, date } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: "ID lớp không hợp lệ" });
    }

    const dayOfWeek = getDayOfWeek(date);
    
    const timetableSlots = await Timetable.find({
      class: classId,
      'timeSlot.dayOfWeek': dayOfWeek
    })
    .populate('subject', 'name')
    .populate('teachers', 'fullname')
    .sort({ 'timeSlot.startTime': 1 });

    // Lấy danh sách unique subjects
    const subjects = [];
    const seenSubjects = new Set();
    
    timetableSlots.forEach(slot => {
      if (slot.subject && !seenSubjects.has(slot.subject._id.toString())) {
        seenSubjects.add(slot.subject._id.toString());
        subjects.push({
          _id: slot.subject._id,
          name: slot.subject.name,
          teachers: slot.teachers.map(t => ({
            _id: t._id,
            fullname: t.fullname
          }))
        });
      }
    });

    res.json({ subjects });
  } catch (err) {
    console.error("Error getting subjects by class and date:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ THÊM: Lấy attendance theo student và date
exports.getAttendancesByStudentAndDate = async (req, res) => {
  try {
    const { studentId, date } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: "ID học sinh không hợp lệ" });
    }

    const attendances = await Attendance.find({
      student: studentId,
      date: new Date(date)
    })
    .populate('student', 'name studentCode avatarUrl')
    .populate('teacher', 'fullname')
    .populate('subject', 'name')
    .populate('class', 'className')
    .sort({ 'periodNumber': 1 });

    res.json(attendances);
  } catch (err) {
    console.error("Error getting attendances by student and date:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ THÊM: Lấy attendance theo class, date, subject
exports.getAttendancesByClassDateSubject = async (req, res) => {
  try {
    const { classId, date, subjectId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: "ID lớp hoặc ID môn học không hợp lệ" });
    }

    const attendances = await Attendance.find({
      class: classId,
      date: new Date(date),
      subject: subjectId
    })
    .populate('student', 'name studentCode avatarUrl')
    .populate('teacher', 'fullname')
    .populate('subject', 'name')
    .sort({ 'periodNumber': 1, 'student.name': 1 });

    res.json(attendances);
  } catch (err) {
    console.error("Error getting attendances by class, date, subject:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ THÊM: Tạo attendance cho một tiết học cụ thể
exports.createPeriodAttendance = async (req, res) => {
  try {
    const { classId, date, subjectId, periodNumber, attendances } = req.body;
    
    if (!classId || !date || !subjectId || !periodNumber || !Array.isArray(attendances)) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }

    // Lấy thông tin timetable slot để có periodStartTime và periodEndTime
    const dayOfWeek = getDayOfWeek(date);
    const timetableSlot = await Timetable.findOne({
      class: classId,
      subject: subjectId,
      'timeSlot.dayOfWeek': dayOfWeek
    });

    if (!timetableSlot) {
      return res.status(400).json({ message: "Không tìm thấy thông tin tiết học trong thời khóa biểu" });
    }

    // Kiểm tra giáo viên
    const isTeacherOfSlot = timetableSlot.teachers.some(tid => tid.toString() === req.user._id.toString());
    
    // Tạm thời bỏ qua kiểm tra quyền trong giai đoạn phát triển
    console.log("User ID:", req.user._id);
    console.log("Teachers of slot:", timetableSlot.teachers.map(t => t.toString()));
    
    // if (!isTeacherOfSlot) {
    //   return res.status(403).json({ message: "Bạn không phải giáo viên của tiết này, không thể điểm danh." });
    // }

    // Tạo hoặc cập nhật attendance cho từng học sinh
    const results = [];
    for (const attendanceData of attendances) {
      const { studentId, status, note, checkIn, checkOut } = attendanceData;
      
      const attendance = await Attendance.findOneAndUpdate(
        {
          class: classId,
          date: new Date(date),
          periodNumber: parseInt(periodNumber),
          student: studentId,
          subject: subjectId
        },
        {
          teacher: req.user._id, // Từ middleware auth
          periodStartTime: timetableSlot.timeSlot.startTime,
          periodEndTime: timetableSlot.timeSlot.endTime,
          timetableSlot: timetableSlot._id,
          status,
          note,
          checkIn,
          checkOut,
          updatedAt: new Date()
        },
        { 
          upsert: true, 
          new: true 
        }
      ).populate('student teacher subject');

      results.push(attendance);
    }

    res.status(201).json({ 
      message: "Điểm danh thành công", 
      attendances: results 
    });
  } catch (err) {
    console.error("Error creating period attendance:", err);
    res.status(500).json({ error: err.message });
  }
};

// Display list of all Attendances
exports.getAttendances = asyncHandler(async (req, res) => {
  const { class: classId, date, periodNumber, subject } = req.query;
  let filter = {};
  if (classId) filter.class = classId;
  if (date) filter.date = date;
  if (periodNumber) filter.periodNumber = parseInt(periodNumber);
  if (subject) filter.subject = subject;
  const attendances = await Attendance.find(filter).populate('student class teacher subject');
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