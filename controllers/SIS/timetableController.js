const mongoose = require("mongoose");
const SchoolYear = require("../../models/SchoolYear");
const Timetable = require("../../models/Timetable");
const Class = require("../../models/Class");
const Subject = require("../../models/Subject");
const Room = require("../../models/Room");
const GradeLevel = require("../../models/GradeLevel");
const PeriodDefinition = require("../../models/PeriodDefinition");
const Teacher = require("../../models/Teacher");
const timetableService = require("../../services/timetable.service");

// Lấy tất cả thời khóa biểu
exports.getAllTimetables = async (req, res) => {
  try {
    const timetables = await Timetable.find()
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name")
      .sort({ "timeSlot.dayOfWeek": 1, "timeSlot.startTime": 1 });

    return res.json(timetables);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy thời khóa biểu theo ID
exports.getTimetableById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID thời khóa biểu không hợp lệ" });
    }

    const timetable = await Timetable.findById(id)
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name");

    if (!timetable) {
      return res.status(404).json({ message: "Không tìm thấy thời khóa biểu" });
    }

    return res.json(timetable);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Tạo thời khóa biểu mới
exports.createTimetable = async (req, res) => {
  try {
    const { schoolYear, class: classId, subject, teachers = [], room, timeSlot } = req.body;

    if (!schoolYear || !classId || !subject || !room || !timeSlot) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }
    if (!Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({ message: "Danh sách giáo viên (teachers) bắt buộc và phải là mảng ≥ 1" });
    }
    if (teachers.length > 2) {
      return res.status(400).json({ message: "Không thể gán quá 2 giáo viên cho một slot" });
    }
    // Kiểm tra xung đột thời gian cho lớp học
    const existingClassTimetable = await Timetable.findOne({
      schoolYear,
      class: classId,
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          $and: [
            { "timeSlot.startTime": { $lte: timeSlot.startTime } },
            { "timeSlot.endTime": { $gt: timeSlot.startTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $lt: timeSlot.endTime } },
            { "timeSlot.endTime": { $gte: timeSlot.endTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $gte: timeSlot.startTime } },
            { "timeSlot.endTime": { $lte: timeSlot.endTime } }
          ]
        },
      ],
    });

    if (existingClassTimetable) {
      return res.status(400).json({ message: "Khung giờ này đã có lịch học cho lớp" });
    }

    // Kiểm tra xung đột thời gian cho giáo viên
    const existingTeacherTimetable = await Timetable.findOne({
      schoolYear,
      teachers: { $in: teachers },
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          $and: [
            { "timeSlot.startTime": { $lte: timeSlot.startTime } },
            { "timeSlot.endTime": { $gt: timeSlot.startTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $lt: timeSlot.endTime } },
            { "timeSlot.endTime": { $gte: timeSlot.endTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $gte: timeSlot.startTime } },
            { "timeSlot.endTime": { $lte: timeSlot.endTime } }
          ]
        },
      ],
    });

    if (existingTeacherTimetable) {
      return res.status(400).json({ message: "Giáo viên đã có lịch dạy trong khung giờ này" });
    }

    // Kiểm tra xung đột thời gian cho phòng học
    const existingRoomTimetable = await Timetable.findOne({
      schoolYear,
      room,
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          $and: [
            { "timeSlot.startTime": { $lte: timeSlot.startTime } },
            { "timeSlot.endTime": { $gt: timeSlot.startTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $lt: timeSlot.endTime } },
            { "timeSlot.endTime": { $gte: timeSlot.endTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $gte: timeSlot.startTime } },
            { "timeSlot.endTime": { $lte: timeSlot.endTime } }
          ]
        },
      ],
    });

    if (existingRoomTimetable) {
      return res.status(400).json({ message: "Phòng học đã được sử dụng trong khung giờ này" });
    }

    const newTimetable = await Timetable.create({
      schoolYear,
      class: classId,
      subject,
      teachers,
      room,
      timeSlot,
    });

    const populatedTimetable = await Timetable.findById(newTimetable._id)
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name");

    return res.status(201).json(populatedTimetable);
  } catch (err) {
    console.error("Error creating timetable:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Cập nhật thời khóa biểu
exports.updateTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolYear, class: classId, subject, teachers = [], room, timeSlot } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID thời khóa biểu không hợp lệ" });
    }
    if (!Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({ message: "Danh sách teachers là bắt buộc" });
    }
    if (teachers.length > 2) {
      return res.status(400).json({ message: "Slot chỉ tối đa 2 giáo viên" });
    }
    // Kiểm tra xung đột thời gian cho lớp học (không tính entry hiện tại)
    const existingClassTimetable = await Timetable.findOne({
      _id: { $ne: id },
      schoolYear,
      class: classId,
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          $and: [
            { "timeSlot.startTime": { $lte: timeSlot.startTime } },
            { "timeSlot.endTime": { $gt: timeSlot.startTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $lt: timeSlot.endTime } },
            { "timeSlot.endTime": { $gte: timeSlot.endTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $gte: timeSlot.startTime } },
            { "timeSlot.endTime": { $lte: timeSlot.endTime } }
          ]
        },
      ],
    });

    if (existingClassTimetable) {
      return res.status(400).json({ message: "Khung giờ này đã có lịch học cho lớp" });
    }

    // Kiểm tra xung đột thời gian cho giáo viên (không tính entry hiện tại)
    const existingTeacherTimetable = await Timetable.findOne({
      _id: { $ne: id },
      schoolYear,
      teachers: { $in: teachers },
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          $and: [
            { "timeSlot.startTime": { $lte: timeSlot.startTime } },
            { "timeSlot.endTime": { $gt: timeSlot.startTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $lt: timeSlot.endTime } },
            { "timeSlot.endTime": { $gte: timeSlot.endTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $gte: timeSlot.startTime } },
            { "timeSlot.endTime": { $lte: timeSlot.endTime } }
          ]
        },
      ],
    });

    if (existingTeacherTimetable) {
      return res.status(400).json({ message: "Giáo viên đã có lịch dạy trong khung giờ này" });
    }

    // Kiểm tra xung đột thời gian cho phòng học (không tính entry hiện tại)
    const existingRoomTimetable = await Timetable.findOne({
      _id: { $ne: id },
      schoolYear,
      room,
      "timeSlot.dayOfWeek": timeSlot.dayOfWeek,
      $or: [
        {
          $and: [
            { "timeSlot.startTime": { $lte: timeSlot.startTime } },
            { "timeSlot.endTime": { $gt: timeSlot.startTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $lt: timeSlot.endTime } },
            { "timeSlot.endTime": { $gte: timeSlot.endTime } }
          ]
        },
        {
          $and: [
            { "timeSlot.startTime": { $gte: timeSlot.startTime } },
            { "timeSlot.endTime": { $lte: timeSlot.endTime } }
          ]
        },
      ],
    });

    if (existingRoomTimetable) {
      return res.status(400).json({ message: "Phòng học đã được sử dụng trong khung giờ này" });
    }

    const updatedTimetable = await Timetable.findByIdAndUpdate(
      id,
      {
        schoolYear,
        class: classId,
        subject,
        teachers,
        room,
        timeSlot,
        updatedAt: new Date(),
      },
      { new: true }
    )
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name");

    if (!updatedTimetable) {
      return res.status(404).json({ message: "Không tìm thấy thời khóa biểu" });
    }

    return res.json(updatedTimetable);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Xóa thời khóa biểu
exports.deleteTimetable = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID thời khóa biểu không hợp lệ" });
    }

    const deletedTimetable = await Timetable.findByIdAndDelete(id);

    if (!deletedTimetable) {
      return res.status(404).json({ message: "Không tìm thấy thời khóa biểu" });
    }

    return res.json({ message: "Xóa thời khóa biểu thành công" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy thời khóa biểu theo lớp
exports.getTimetableByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    console.log('🔍 getTimetableByClass called with classId:', classId);

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: "ID lớp không hợp lệ" });
    }

    const timetable = await Timetable.find({ class: classId })
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name")
      .sort({ "timeSlot.dayOfWeek": 1, "timeSlot.startTime": 1 });

    console.log('📅 Raw timetable found:', timetable.length, 'entries');
    if (timetable.length > 0) {
      console.log('📅 Sample timetable entry:', {
        subject: timetable[0].subject?.name,
        dayOfWeek: timetable[0].timeSlot?.dayOfWeek,
        startTime: timetable[0].timeSlot?.startTime,
        teachers: timetable[0].teachers?.map(t => ({
          fullname: t.fullname || t.user?.fullname,
          avatarUrl: t.avatarUrl,
          userAvatarUrl: t.user?.avatarUrl
        }))
      });
    }

    // Transform data for parent-portal compatibility
    const transformedTimetable = timetable.map(item => ({
      ...item.toObject(),
      teachers: item.teachers.map(teacher => ({
        _id: teacher._id,
        fullname: teacher.fullname || teacher.user?.fullname || 'Không có tên',
        avatarUrl: teacher.avatarUrl || teacher.user?.avatarUrl || null,
        user: teacher.user // Keep original structure for backward compatibility
      }))
    }));

    console.log('📅 Returning transformed timetable:', transformedTimetable.length, 'entries');
    return res.json(transformedTimetable);
  } catch (err) {
    console.error('❌ Error in getTimetableByClass:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Tạo thời khóa biểu tự động
exports.generateTimetable = async (req, res) => {
  try {
    const { schoolYearId, classId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(schoolYearId) || !mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: "ID năm học hoặc ID lớp không hợp lệ" });
    }

    // Xóa thời khóa biểu cũ nếu có
    await Timetable.deleteMany({ schoolYear: schoolYearId, class: classId });

    const classData = await Class.findById(classId).populate('curriculum');
    if (!classData || !classData.curriculum) {
      return res.status(400).json({ message: "Lớp học không tồn tại hoặc chưa có chương trình học" });
    }

    // Lấy thông tin môn học và số tiết từ curriculum
    const curriculum = await classData.populate({
      path: 'curriculum',
      populate: { path: 'subjects.subject' }
    });

    if (!curriculum || !curriculum.curriculum || !curriculum.curriculum.subjects) {
      return res.status(400).json({ message: "Chương trình học không có thông tin môn học" });
    }

    // Lấy danh sách giáo viên và phòng học khả dụng
    const teachers = await Teacher.find({}).populate('subjects');
    const rooms = await Room.find({}).populate('subjects');

    // Các tiết học trong một ngày
    const periods = [
      { startTime: "07:00", endTime: "07:45" },
      { startTime: "07:50", endTime: "08:35" },
      { startTime: "08:40", endTime: "09:25" },
      { startTime: "09:40", endTime: "10:25" },
      { startTime: "10:30", endTime: "11:15" },
      { startTime: "13:00", endTime: "13:45" },
      { startTime: "13:50", endTime: "14:35" },
      { startTime: "14:40", endTime: "15:25" },
      { startTime: "15:40", endTime: "16:25" },
      { startTime: "16:30", endTime: "17:15" }
    ];

    // Thứ trong tuần cho việc lên lịch
    const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    // Tạo mảng để lưu trữ kết quả phân bổ
    const generatedTimetable = [];

    // Mảng để theo dõi thời khóa biểu hiện tại
    const currentTimetable = [];
    for (let i = 0; i < daysOfWeek.length; i++) {
      currentTimetable[i] = [];
      for (let j = 0; j < periods.length; j++) {
        currentTimetable[i][j] = null;
      }
    }

    // Đếm số tiết đã phân bổ cho mỗi môn học
    const allocatedPeriodsPerSubject = {};

    // Khởi tạo số tiết đã phân bổ cho mỗi môn học là 0
    curriculum.curriculum.subjects.forEach(subject => {
      allocatedPeriodsPerSubject[subject.subject._id.toString()] = 0;
    });

    // Tạo bản đồ để theo dõi giáo viên và phòng học đã được phân công
    const teacherAllocation = {};
    const roomAllocation = {};

    daysOfWeek.forEach(day => {
      teacherAllocation[day] = {};
      roomAllocation[day] = {};

      periods.forEach((period, periodIndex) => {
        teacherAllocation[day][periodIndex] = null;
        roomAllocation[day][periodIndex] = null;
      });
    });

    // Phân bổ các tiết học
    curriculum.curriculum.subjects.forEach(subjectEntry => {
      const subject = subjectEntry.subject;
      const periodsPerWeek = subjectEntry.periodsPerWeek;

      // Tìm giáo viên có thể dạy môn này
      const eligibleTeachers = teachers.filter(teacher =>
        teacher.subjects.some(s => s._id.toString() === subject._id.toString())
      );

      // Tìm phòng học có thể sử dụng cho môn này
      const eligibleRooms = rooms.filter(room =>
        !room.subjects || room.subjects.length === 0 ||
        room.subjects.some(s => s._id.toString() === subject._id.toString())
      );

      if (eligibleTeachers.length === 0) {
        console.warn(`Không tìm thấy giáo viên phù hợp cho môn ${subject.name}`);
        return;
      }

      if (eligibleRooms.length === 0) {
        console.warn(`Không tìm thấy phòng học phù hợp cho môn ${subject.name}`);
        return;
      }

      // Phân bổ số tiết cần thiết
      let allocatedPeriods = 0;

      while (allocatedPeriods < periodsPerWeek) {
        // Tìm một slot còn trống
        let allocated = false;

        for (let dayIndex = 0; dayIndex < daysOfWeek.length && !allocated; dayIndex++) {
          const day = daysOfWeek[dayIndex];

          for (let periodIndex = 0; periodIndex < periods.length && !allocated; periodIndex++) {
            // Kiểm tra slot này đã được sử dụng chưa
            if (currentTimetable[dayIndex][periodIndex] === null) {
              // Kiểm tra xem giáo viên và phòng học còn trống không
              const availableTeachers = eligibleTeachers.filter(teacher =>
                !teacherAllocation[day][periodIndex] ||
                teacherAllocation[day][periodIndex].toString() !== teacher._id.toString()
              );

              const availableRooms = eligibleRooms.filter(room =>
                !roomAllocation[day][periodIndex] ||
                roomAllocation[day][periodIndex].toString() !== room._id.toString()
              );

              if (availableTeachers.length > 0 && availableRooms.length > 0) {
                // Chọn ngẫu nhiên giáo viên và phòng học từ danh sách khả dụng
                const selectedTeacher = availableTeachers[Math.floor(Math.random() * availableTeachers.length)];
                const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

                // Ghi nhận việc phân bổ
                currentTimetable[dayIndex][periodIndex] = {
                  subject: subject._id,
                  teacher: selectedTeacher._id,
                  room: selectedRoom._id
                };

                teacherAllocation[day][periodIndex] = selectedTeacher._id;
                roomAllocation[day][periodIndex] = selectedRoom._id;

                // Thêm vào mảng kết quả
                generatedTimetable.push({
                  schoolYear: schoolYearId,
                  class: classId,
                  subject: subject._id,
                  teacher: selectedTeacher._id,
                  room: selectedRoom._id,
                  timeSlot: {
                    dayOfWeek: day,
                    startTime: periods[periodIndex].startTime,
                    endTime: periods[periodIndex].endTime
                  }
                });

                allocatedPeriods++;
                allocatedPeriodsPerSubject[subject._id.toString()]++;
                allocated = true;
              }
            }
          }
        }

        // Nếu không thể phân bổ thêm, thoát khỏi vòng lặp
        if (!allocated) break;
      }
    });

    // Lưu thời khóa biểu đã tạo vào cơ sở dữ liệu
    await Timetable.insertMany(generatedTimetable);

    // Trả về thời khóa biểu đã tạo
    const savedTimetable = await Timetable.find({ schoolYear: schoolYearId, class: classId })
      .populate("schoolYear", "code")
      .populate("class", "className")
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name")
      .sort({ "timeSlot.dayOfWeek": 1, "timeSlot.startTime": 1 });

    return res.status(201).json({
      message: "Tạo thời khóa biểu tự động thành công",
      timetable: savedTimetable
    });
  } catch (err) {
    console.error("Error generating timetable:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Lấy thời khóa biểu dạng bảng
exports.getTimetableGridByClass = async (req, res) => {
  try {
    console.log("=== getTimetableGridByClass called ===");
    const { classId, schoolYearId } = req.params;
    const { scheduleId } = req.query;
    console.log("Params:", { classId, schoolYearId });

    if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(schoolYearId)) {
      console.log("Invalid IDs");
      return res.status(400).json({ message: "ID lớp hoặc ID năm học không hợp lệ" });
    }

    // Định nghĩa các ngày trong tuần
    const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    // Lấy thông tin class để biết school
    console.log("Fetching class info...");
    const classInfo = await Class.findById(classId)
      .populate({
        path: 'gradeLevel',
        populate: {
          path: 'school'
        }
      });
    
    if (!classInfo) {
      console.log("Class not found");
      return res.status(400).json({ message: "Không tìm thấy lớp học" });
    }

    console.log("Class info:", JSON.stringify(classInfo, null, 2));

    const schoolId = classInfo.gradeLevel?.school?._id || classInfo.gradeLevel?.school;
    if (!schoolId) {
      console.log("School ID not found in class info");
      return res.status(400).json({ message: "Không tìm thấy thông tin trường của lớp học" });
    }

    console.log("Found school ID:", schoolId);

    // Lấy period definitions để xác định số tiết và mapping startTime -> periodNumber
    console.log("Fetching period definitions...");
    const periodDefs = await PeriodDefinition.find({ 
      schoolYear: schoolYearId,
      school: schoolId 
    });
    
    console.log("Period definitions found:", periodDefs.length);
    
    if (periodDefs.length === 0) {
      console.log("No period definitions found");
      return res.status(400).json({ message: "Chưa khai báo tiết học cho trường và năm học này" });
    }

    // Lấy timetables
    console.log("Fetching timetables...");
    let timetableQuery = {
      class: classId,
      schoolYear: schoolYearId
    };

    if (scheduleId) {
      timetableQuery.scheduleId = scheduleId;
    }

    const timetables = await Timetable.find(timetableQuery)
      .populate("subject", "name")
      .populate({
        path: 'teachers',
        populate: { path: 'user', select: 'fullname avatarUrl' }
      })
      .populate("room", "name");

    console.log("Timetables found:", timetables.length);
    const startTimeToPeriod = {};
    periodDefs.forEach(p => {
      startTimeToPeriod[p.startTime] = p.periodNumber;
    });
    // Lấy TẤT CẢ các periodNumber đã khai báo và sort tăng dần
    const periods = periodDefs
      .map(p => p.periodNumber)
      .sort((a, b) => a - b);

    // Additional debug log after building startTimeToPeriod
    console.log("startTimeToPeriod map:", startTimeToPeriod);

    // Tạo lưới thời khóa biểu trống
    const grid = {};
    daysOfWeek.forEach(day => {
      grid[day] = {};
      periods.forEach(period => {
        grid[day][period] = null;
      });
    });

    // Điền dữ liệu vào lưới
    timetables.forEach(timetable => {
      const day = timetable.timeSlot.dayOfWeek;
      const periodNumber = startTimeToPeriod[timetable.timeSlot.startTime];

      if (day && periodNumber !== undefined) {
        grid[day][periodNumber] = {
          subject: timetable.subject?.name || 'Chưa có môn học',
          teachers: (timetable.teachers?.length)
            ? timetable.teachers.map(t => t.fullname).join(", ")
            : "Chưa có giáo viên",
          room: timetable.room?.name || 'Chưa có phòng',
          id: timetable._id
        };
      }
    });

    return res.json({ data: grid });
  } catch (err) {
    console.error("Error getting timetable grid:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Tạo thời khóa biểu tự động cho toàn trường
exports.generateTimetableForSchool = async (req, res) => {
  try {
    const { schoolYearId, schoolId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(schoolYearId) || !mongoose.Types.ObjectId.isValid(schoolId)) {
      return res.status(400).json({ message: "ID năm học hoặc ID trường không hợp lệ" });
    }

    const schoolYear = await SchoolYear.findById(schoolYearId);
    if (!schoolYear) {
      return res.status(400).json({ message: "Năm học không tồn tại" });
    }

    // Lấy danh sách grade levels của trường
    const gradeLevels = await GradeLevel.find({
      school: schoolId,
      isDeleted: { $ne: true }
    });

    if (!gradeLevels || gradeLevels.length === 0) {
      return res.status(400).json({ message: "Không tìm thấy khối lớp nào trong trường này" });
    }

    // Lấy danh sách lớp từ các grade levels
    const classes = await Class.find({
      gradeLevel: { $in: gradeLevels.map(gl => gl._id) },
      schoolYear: schoolYearId,
      isDeleted: { $ne: true }
    });

    if (classes.length === 0) {
      return res.status(400).json({ message: "Không tìm thấy lớp nào trong trường này" });
    }

    const teachers = await Teacher.find({ school: schoolId }).populate('subjects');
    const rooms = await Room.find({}).populate('subjects');

    if (teachers.length === 0 || rooms.length === 0) {
      return res.status(400).json({ message: "Không đủ giáo viên hoặc phòng học" });
    }

    // Gọi service để sinh thời khóa biểu cho toàn bộ trường
    const result = await timetableService.generateTimetableForSchool(schoolYearId, schoolId);

    if (!result.success) {
      return res.status(400).json({ message: "Lỗi khi tạo thời khóa biểu", errors: result.errors });
    }

    return res.status(201).json({
      success: true,
      message: result.message,
      timetableCount: result.timetableCount
    });
  } catch (err) {
    console.error("Error generating timetable for school:", err);
    return res.status(500).json({ message: "Lỗi khi tạo thời khóa biểu: " + err.message });
  }
};

// Lấy thời khóa biểu của giáo viên
exports.getTeacherTimetable = async (req, res) => {
  try {
    const { teacherId, schoolYearId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(teacherId) || !mongoose.Types.ObjectId.isValid(schoolYearId)) {
      return res.status(400).json({ message: "ID giáo viên hoặc ID năm học không hợp lệ" });
    }

    const timetables = await Timetable.find({
      teacher: teacherId,
      schoolYear: schoolYearId
    })
      .populate("class", "className")
      .populate("subject", "name")
      .populate("room", "name")
      .sort({ "timeSlot.dayOfWeek": 1, "timeSlot.startTime": 1 });

    return res.json(timetables.map(t => ({
      class: t.class.className,
      subject: t.subject.name,
      room: t.room.name,
      dayOfWeek: t.timeSlot.dayOfWeek,
      startTime: t.timeSlot.startTime,
      endTime: t.timeSlot.endTime
    })));
  } catch (err) {
    console.error("Error getting teacher timetable:", err);
    return res.status(500).json({ error: err.message });
  }
};


// ========================= BULK IMPORT FROM EXCEL =========================
exports.importTimetable = async (req, res) => {
  try {
    const { schoolYear, records } = req.body || {};
    const subjectDocs = await Subject.find({})
      .select("needFunctionRoom rooms")
      .lean();

    const subjectRoomMap = new Map(); // id → { need, rooms[ ] }
    subjectDocs.forEach(s => {
      subjectRoomMap.set(s._id.toString(), {
        need: s.needFunctionRoom,
        rooms: (s.rooms || []).map(r => r.toString()) // giữ thứ tự
      });
    });

    // ---- Phòng đã bận (room|day|start) từ DB hiện tại ----
    const occupied = new Set();
    const existing = await Timetable.find({ schoolYear })
      .select("room timeSlot")
      .lean();
    existing.forEach(t => {
      occupied.add(`${t.room}|${t.timeSlot.dayOfWeek}|${t.timeSlot.startTime}`);
    });
    // Log các dayOfWeek xuất hiện trong payload
    const uniqueDays = [...new Set((records || []).map(r => r.dayOfWeek))];
    console.log("Incoming dayOfWeek values:", uniqueDays);
    console.log("===== Import Timetable =====");
    console.log("SchoolYear:", schoolYear, "Total incoming records:", Array.isArray(records) ? records.length : 0);

    if (!schoolYear || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: "Thiếu dữ liệu schoolYear hoặc records" });
    }
    if (!mongoose.Types.ObjectId.isValid(schoolYear)) {
      return res.status(400).json({ message: "schoolYear không hợp lệ" });
    }

    // 1. Map classCode -> classId (chỉ trong schoolYear này)
    const classCodes = [...new Set(records.map(r => r.classCode))];
    const classDocs = await Class.find({ className: { $in: classCodes }, schoolYear })
      .select("_id className");
    const classMap = {};
    classDocs.forEach(c => { classMap[c.className] = c._id; });

    // 2. Lấy period definitions để map periodNumber -> start/end
    const periodDefs = await PeriodDefinition.find({ schoolYear });
    const periodMap = {};
    periodDefs.forEach(p => { periodMap[p.periodNumber] = { startTime: p.startTime, endTime: p.endTime }; });

    console.log("Class map keys (classCodes):", Object.keys(classMap));
    console.log("Period map numbers:", Object.keys(periodMap));

    // 2.5. Tìm phòng Homeroom mặc định (nếu có)
    let homeroomRoom = await Room.findOne({ isHomeroom: true });
    if (!homeroomRoom) {
      // tạo nhanh phòng homeroom mặc định nếu chưa có
      homeroomRoom = await Room.create({
        name: "Homeroom",
        type: "classroom",
        capacity: 50,
        isHomeroom: true,
      });
      console.log("Created default Homeroom room with _id:", homeroomRoom._id);
    } else {
      console.log("Default Homeroom room:", homeroomRoom.name, homeroomRoom._id);
    }

    // 3. Chuẩn hoá records thành bulkWrite ops (upsert)
    const ops = [];
    const errors = [];

    // 3. Build bulkWrite ops (upsert) with smart room‑assignment
    for (const rec of records) {
      const classId = classMap[rec.classCode];
      // ═══ Ưu tiên giáo viên từ teachingAssignments ═══
      let teachersFinal =
        Array.isArray(rec.teachers) ? rec.teachers.filter(Boolean) : [];
      if (teachersFinal.length === 0) {
        // Tìm TẤT CẢ giáo viên dạy môn học này cho lớp này
        const assigns = await Teacher.find({
          "teachingAssignments.class": classId,
          "teachingAssignments.subjects": rec.subject,
        }).select("_id fullname");
        
        console.log(`🔍 Searching teachers for:`, {
          classCode: rec.classCode,
          classId: classId,
          subjectId: rec.subject
        });
        console.log(`🔍 Found ${assigns.length} teachers:`, assigns.map(t => t.fullname));
        
        // Lấy tối đa 2 giáo viên đầu tiên
        teachersFinal = assigns.map(t => t._id.toString()).slice(0, 2);
      }
      rec.teachers = teachersFinal;          // bảo đảm luôn là mảng (≤2)
      if (!classId) {
        errors.push(`Không tìm thấy lớp ${rec.classCode}`);
        continue;
      }

      const period = periodMap[rec.periodNumber];
      if (!period) {
        errors.push(`Chưa khai báo tiết ${rec.periodNumber}`);
        continue;
      }

      /* ==== Chọn phòng theo ưu tiên & tránh trùng lịch ==== */
      let chosenRoomId = homeroomRoom._id; // default

      const subjInfo = subjectRoomMap.get(String(rec.subject));
      if (subjInfo && subjInfo.need && subjInfo.rooms.length) {
        for (const candidate of subjInfo.rooms) {
          const key = `${candidate}|${rec.dayOfWeek}|${period.startTime}`;
          if (!occupied.has(key)) {
            chosenRoomId = candidate;
            occupied.add(key);             // đánh dấu phòng đã bận
            break;
          }
        }
      }

      ops.push({
        updateOne: {
          filter: {
            schoolYear,
            class: classId,
            "timeSlot.dayOfWeek": rec.dayOfWeek,
            "timeSlot.startTime": period.startTime
          },
          update: {
            $set: {
              subject: rec.subject,
              teachers: rec.teachers || [],
              room: chosenRoomId,
              "timeSlot.endTime": period.endTime
            },
            $setOnInsert: {
              schoolYear,
              class: classId,
              "timeSlot.dayOfWeek": rec.dayOfWeek,
              "timeSlot.startTime": period.startTime,
              createdAt: new Date()
            },
          },
          upsert: true,
        },
      });
    }

    // (Optional) Log các dayOfWeek actually accepted in ops
    const acceptedDays = [...new Set(ops.map(op => op.updateOne.filter["timeSlot.dayOfWeek"]))];
    console.log("Accepted dayOfWeek in bulk ops:", acceptedDays);
    console.log("Bulk operations prepared:", ops.length, "Errors:", errors.length);
    if (errors.length) console.log("First 20 errors:", errors.slice(0, 20));

    if (ops.length === 0) {
      return res.status(400).json({ message: "Không có bản ghi hợp lệ", errors });
    }

    // 4. bulkWrite with upsert to avoid duplicates
    const result = await Timetable.bulkWrite(ops, { ordered: false });
    console.log("bulkWrite result:", result);

    const inserted = (result.upsertedCount || 0) + (result.insertedCount || 0);
    const modified = result.modifiedCount || 0;

    return res.status(201).json({
      message: "Import thành công",
      inserted,
      modified,
      skippedErrors: errors.length,
      errors,
    });
  } catch (err) {
    console.error("Error import timetable:", err);
    return res.status(500).json({ message: "Lỗi import: " + err.message });
  }
};

// Get all period definitions for a school year and school
exports.getPeriodDefinitions = async (req, res) => {
  try {
    const { schoolYearId } = req.params;
    const { schoolId } = req.query;
    console.log('⏰ getPeriodDefinitions called with:', { schoolYearId, schoolId });
    
    const filter = { schoolYear: schoolYearId };
    if (schoolId) {
      filter.school = schoolId;
    }
    console.log('⏰ Period filter:', filter);
    
    const periods = await PeriodDefinition.find(filter).sort({ periodNumber: 1 });
    console.log('⏰ Found periods:', periods.length);
    if (periods.length > 0) {
      console.log('⏰ Sample period:', {
        periodNumber: periods[0].periodNumber,
        startTime: periods[0].startTime,
        endTime: periods[0].endTime,
        school: periods[0].school
      });
    }
    
    return res.json({ data: periods });
  } catch (err) {
    console.error("❌ Error fetching period definitions:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Create a new period definition
exports.createPeriodDefinition = async (req, res) => {
  try {
    const { schoolYearId } = req.params;
    const { periodNumber, startTime, endTime, label, type, school } = req.body;
    
    if (!school) {
      return res.status(400).json({ message: "School ID is required" });
    }
    
    const newPeriod = await PeriodDefinition.create({ 
      schoolYear: schoolYearId, 
      school,
      periodNumber, 
      startTime, 
      endTime, 
      label, 
      type: type || 'regular' // Default to 'regular' if not provided
    });
    return res.status(201).json({ data: newPeriod });
  } catch (err) {
    console.error("Error creating period definition:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Update an existing period definition
exports.updatePeriodDefinition = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await PeriodDefinition.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: "Period not found" });
    return res.json({ data: updated });
  } catch (err) {
    console.error("Error updating period definition:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Delete a period definition
exports.deletePeriodDefinition = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PeriodDefinition.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Period not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting period definition:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /timetables/teachers?class=<id>&subject=<id>
exports.getTeachersByClassSubject = async (req, res) => {
  try {
    const { class: classId, subject } = req.query;
    if (!classId || !subject) {
      return res.status(400).json({ message: "class & subject are required" });
    }

    const rows = await Timetable.find({ class: classId, subject })
      .select("teachers")
      .populate("teachers", "fullname avatarUrl");

    const uniq = new Map();
    rows.forEach(r =>
      r.teachers.forEach(t => uniq.set(t._id.toString(), t.fullname))
    );

    const teachers = [...uniq.entries()].map(([id, fullname]) => ({
      _id: id, fullname
    }));
    res.json({ teachers });
  } catch (err) {
    console.error("getTeachersByClassSubject", err);
    res.status(500).json({ error: err.message });
  }
};