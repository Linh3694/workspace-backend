const mongoose = require("mongoose");
const Teacher = require("../../models/Teacher");
const User = require("../../models/Users");
const Subject = require("../../models/Subject");
const {
  syncTimetableAfterAssignment,
} = require("../services/timetableSync.service");

// Lấy tất cả giáo viên
exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find()
      .populate('user', 'fullname email avatarUrl')
      .populate('subjects', 'name code')
      .populate({
        path: 'classes',
        select: 'className gradeLevel',
        populate: { path: 'gradeLevel', select: 'name code order' }
      })
      .populate({
        path: 'gradeLevels',
        select: 'name code order subjects',
        populate: { path: 'subjects', select: 'name code' }
      })
      .populate('curriculums', '_id name')
      .populate('educationalSystem', 'name description')
      .populate('school', 'name code type')

      .populate({ path: 'teachingAssignments.class', select: 'className' })
      .populate({ path: 'teachingAssignments.subjects', select: 'name code' })
      .sort({ fullname: 1 });
    return res.json(teachers);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy giáo viên theo ID
exports.getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID giáo viên không hợp lệ" });
    }

    const teacher = await Teacher.findById(id)
      .populate('user', 'fullname email')
      .populate('subjects', 'name code')
      .populate({
        path: 'classes',
        select: 'className gradeLevel',
        populate: { path: 'gradeLevel', select: 'name code order' }
      })
      .populate({
        path: 'gradeLevels',
        select: 'name code order subjects',
        populate: { path: 'subjects', select: 'name code' }
      })
      .populate('curriculums', '_id name')
      .populate('educationalSystem', 'name description')
      .populate({ path: 'teachingAssignments.class', select: 'className' })
      .populate({ path: 'teachingAssignments.subjects', select: 'name code' })
      .populate('school', 'name code type');

    if (!teacher) {
      return res.status(404).json({ message: "Không tìm thấy giáo viên" });
    }

    return res.json(teacher);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Tạo giáo viên mới
exports.createTeacher = async (req, res) => {
  try {
    const { fullname, email, phone, jobTitle, subjects, curriculums, gradeLevels, school } = req.body;

    if (!school) {
      return res.status(400).json({ message: "Trường học là bắt buộc" });
    }

    // Create user account for teacher using User system
    const user = await User.create({
      username: email,
      email,
      fullname,
      jobTitle,
      role: "teacher",
      active: true,
      // Password sẽ được quản lý bởi hệ thống User
      // Có thể gửi email để user tự tạo password lần đầu
    });

    // Create teacher profile
    const teacher = await Teacher.create({
      user: user._id,
      fullname,
      email,
      phone,
      jobTitle,
      school,
      subjects: subjects || [],
      curriculums: curriculums || [],
      gradeLevels: gradeLevels || [],
    });

    await teacher.populate([
      { path: "user", select: "fullname email jobTitle" },
      { path: "subjects", select: "name code" },
      { path: "curriculums", select: "_id name" },
      { path: "gradeLevels", select: "name code" },
      { path: "school", select: "name code" }
    ]);

    // Gửi email cho giáo viên với link để tạo password
    // TODO: Implement email sending with password creation link

    res.status(201).json(teacher);
  } catch (error) {
    console.error("Error creating teacher:", error);
    res.status(400).json({ message: "Không thể tạo giáo viên" });
  }
};

// Cập nhật giáo viên
exports.updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { subjectAssignments, fullname, email, phone, jobTitle, subjects, curriculums, gradeLevels, school, educationalSystem, classes } = req.body;
    const updateData = {};

    const teacher = await Teacher.findById(id);
    if (!teacher) {
      return res.status(404).json({ message: "Không tìm thấy giáo viên" });
    }

    // Only check for school if it's provided in the request
    if (school === "") {
      return res.status(400).json({ message: "Trường học là bắt buộc" });
    }

    // Update user account if personal info is provided
    if (email || fullname || jobTitle) {
      await User.findByIdAndUpdate(teacher.user, {
        email,
        fullname,
        jobTitle,
      });
    }

    // Ghi teachingAssignments (class – nhiều môn)
    if (subjectAssignments && Array.isArray(subjectAssignments)) {
      updateData.teachingAssignments = subjectAssignments.map(sa => ({
        class: sa.classId,
        subjects: sa.subjectIds,
      }));
      // Cập nhật mảng subjects gộp để cột “Môn học phụ trách” vẫn đúng
      const flatIds = [...new Set(subjectAssignments.flatMap(sa => sa.subjectIds))];
      updateData.subjects = flatIds;
    }

    // Handle subject assignments
    if (subjects) {
      // Remove teacher from old subjects
      if (teacher.subjects && teacher.subjects.length > 0) {
        await Subject.updateMany(
          { _id: { $in: teacher.subjects } },
          { $pull: { teachers: teacher._id } }
        );
      }

      // Add teacher to new subjects
      await Subject.updateMany(
        { _id: { $in: subjects } },
        { $addToSet: { teachers: teacher._id } }
      );
    }

    // Build update object with only provided fields
    if (fullname) updateData.fullname = fullname;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (jobTitle) updateData.jobTitle = jobTitle;
    if (school) updateData.school = school;
    if (subjects) updateData.subjects = subjects;
    if (curriculums) updateData.curriculums = curriculums;
    if (educationalSystem) updateData.educationalSystem = educationalSystem;
    if (gradeLevels) updateData.gradeLevels = gradeLevels;
    if (classes) updateData.classes = classes;

    // Update teacher profile
    const updatedTeacher = await Teacher.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate([
      { path: "user", select: "fullname email jobTitle" },
      { path: "subjects", select: "name code" },
      { path: "curriculums", select: "_id name" },
      {
        path: "gradeLevels",
        select: "name code order subjects",
        populate: { path: "subjects", select: "name code" }
      },
      {
        path: "classes",
        select: "className gradeLevel",
        populate: { path: "gradeLevel", select: "name code order" }
      },
      { path: "teachingAssignments.class", select: "className" },
      { path: "teachingAssignments.subjects", select: "name code" },
      { path: "school", select: "name code" },
      { path: "educationalSystem", select: "name" }
    ]);
    if (subjectAssignments?.length) {
      const prevMap = new Map(
        (teacher.teachingAssignments || []).map(ta => [
          ta.class.toString(),
          ta.subjects.map(s => s.toString())
        ])
      );

      for (const sa of subjectAssignments) {
        const prevSubs = prevMap.get(sa.classId) || [];
        const added = sa.subjectIds.filter(sid => !prevSubs.includes(sid));
        const removed = prevSubs.filter(sid => !sa.subjectIds.includes(sid));

        if (added.length) {
          await syncTimetableAfterAssignment({
            classId: sa.classId,
            subjectIds: added,
            teacherId: id,
            action: "add",
          });
        }
        if (removed.length) {
          await syncTimetableAfterAssignment({
            classId: sa.classId,
            subjectIds: removed,
            teacherId: id,
            action: "remove",
          });
        }
      }
    }
    res.json(updatedTeacher);
  } catch (error) {
    console.error("Error updating teacher:", error);
    res.status(400).json({ message: "Không thể cập nhật giáo viên" });
  }
};

// Xóa giáo viên
exports.deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID giáo viên không hợp lệ" });
    }

    const teacher = await Teacher.findById(id);
    if (!teacher) {
      return res.status(404).json({ message: "Không tìm thấy giáo viên" });
    }

    // Xóa user account
    await User.findByIdAndDelete(teacher.user);

    // Xóa teacher
    await Teacher.findByIdAndDelete(id);

    return res.json({ message: "Xóa giáo viên thành công" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /teachers/search
exports.searchTeachers = async (req, res) => {
  try {
    const {
      schoolYear,
      gradeLevel,
      subject,
      keyword = "",
      page = 1,
      limit = 20,
    } = req.query;

    const cond = {};
    if (gradeLevel) cond.gradeLevels = gradeLevel;
    if (subject) cond.subjects = subject;
    if (keyword) cond.fullname = { $regex: keyword, $options: "i" };

    // (future) schoolYear filter nếu cần
    const teachers = await Teacher.find(cond)
      .select("_id fullname email phone")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ fullname: 1 });

    return res.json({ data: teachers });
  } catch (err) {
    console.error("Error searching teachers:", err);
    return res.status(500).json({ message: "Không thể tìm giáo viên" });
  }
};

