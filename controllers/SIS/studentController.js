const asyncHandler = require('express-async-handler');
const Student = require('../../models/Student');
const User = require('../../models/Users');
const Family = require('../../models/Family');
const Parent = require('../../models/Parent');

// Display list of all Students
exports.getStudents = asyncHandler(async (req, res) => {
  let query = Student.find();

  // Kiểm tra các query parameters để populate các trường liên quan
  if (req.query.populate) {
    const fieldsToPopulate = req.query.populate.split(',');

    if (fieldsToPopulate.includes('family')) {
      query = query.populate('family', 'familyCode address');
    }

    if (fieldsToPopulate.includes('class')) {
      query = query.populate('class');
    }
  } else {
    // Mặc định vẫn populate class
    query = query.populate('class');
  }

  const students = await query;
  res.json(students);
});

// Get a single Student by ID
exports.getStudentById = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id).populate('class');
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }
  res.json(student);
});

// Create a new Student
exports.createStudent = asyncHandler(async (req, res) => {
  if (!req.body.data) {
    return res.status(400).json({ message: 'Thiếu trường data trong request' });
  }
  let studentData;
  try {
    studentData = JSON.parse(req.body.data);
  } catch (err) {
    return res.status(400).json({ message: 'Dữ liệu data không phải JSON hợp lệ' });
  }

  // Xử lý avatar
  if (req.file) {
    studentData.avatarUrl = `/uploads/Student/${req.file.filename}`;
    console.log('avatarUrl:', studentData.avatarUrl);
  }

  // Xử lý tạo parent nếu có parentAccounts
  let parentIds = [];
  if (req.body.parentAccounts) {
    const parentAccounts = JSON.parse(req.body.parentAccounts);
    for (const acc of parentAccounts) {
      // 1. Tạo user
      const user = await User.create({
        username: acc.username,
        password: acc.password,
        email: acc.email,
        role: 'parent',
        fullname: acc.fullname,
        active: true,
      });
      // 2. Tạo parent
      const parent = await Parent.create({
        user: user._id,
        fullname: acc.fullname,
        phone: acc.phone,
        email: acc.email,
      });
      parentIds.push(parent._id);
    }
  }

  // Nếu không có parentIds, lấy từ studentData.parents (nếu đã là ObjectId)
  if (parentIds.length === 0 && Array.isArray(studentData.parents)) {
    parentIds = studentData.parents.filter(p => typeof p === 'string' || typeof p === 'object' && p._id).map(p => typeof p === 'string' ? p : p._id);
  }

  studentData.parents = parentIds;

  // Xử lý Family
  let familyId = studentData.family;
  if (familyId) {
    // Nếu có familyId, thêm student vào family
    const family = await Family.findById(familyId);
    if (family) {
      family.students.push(studentData._id);
      await family.save();
      // Thêm student vào students của từng parent trong family
      for (const parentObj of family.parents) {
        const parent = await Parent.findById(parentObj.parent);
        if (parent && !parent.students.includes(studentData._id)) {
          parent.students.push(studentData._id);
          await parent.save();
        }
      }
    }
  } else if (parentIds.length > 0) {
    // Nếu không có familyId nhưng có parents, tạo family mới
    const family = new Family({
      familyCode: `FAM${Date.now()}`,
      parents: parentIds.map(parentId => ({
        parent: parentId,
        relationship: 'Khác' // Mặc định là 'Khác', có thể cập nhật sau
      })),
      students: [studentData._id]
    });
    const newFamily = await family.save();
    familyId = newFamily._id;
    studentData.family = familyId;
  }

  console.log('Final studentData:', studentData);

  const student = new Student(studentData);
  const newStudent = await student.save();
  res.status(201).json(newStudent);
});

// Update a Student
exports.updateStudent = asyncHandler(async (req, res) => {
  if (!req.body.data) {
    return res.status(400).json({ message: 'Thiếu trường data trong request' });
  }
  let studentData;
  try {
    studentData = JSON.parse(req.body.data);
  } catch (err) {
    return res.status(400).json({ message: 'Dữ liệu data không phải JSON hợp lệ' });
  }

  // Xử lý avatar mới (nếu có)
  if (req.file) {
    studentData.avatarUrl = `/uploads/Student/${req.file.filename}`;
  }

  // Xử lý tạo parent mới nếu có parentAccounts
  let parentIds = [];
  if (req.body.parentAccounts) {
    const parentAccounts = JSON.parse(req.body.parentAccounts);
    for (const acc of parentAccounts) {
      // 1. Tạo user
      const user = await User.create({
        username: acc.username,
        password: acc.password,
        email: acc.email,
        role: 'parent',
        fullname: acc.fullname,
        active: true,
      });
      // 2. Tạo parent
      const parent = await Parent.create({
        user: user._id,
        fullname: acc.fullname,
        phone: acc.phone,
        email: acc.email,
      });
      parentIds.push(parent._id);
    }
  }

  // Nếu không có parentIds mới, giữ lại các parent cũ (nếu có)
  if (parentIds.length === 0 && Array.isArray(studentData.parents)) {
    parentIds = studentData.parents.filter(p => typeof p === 'string' || (typeof p === 'object' && p._id)).map(p => typeof p === 'string' ? p : p._id);
  }

  studentData.parents = parentIds;

  // Lấy thông tin student hiện tại
  const currentStudent = await Student.findById(req.params.id);
  if (!currentStudent) {
    return res.status(404).json({ message: 'Student not found' });
  }

  // Xử lý Family
  let familyId = studentData.family;
  if (familyId) {
    // Nếu có familyId mới
    if (currentStudent.family && currentStudent.family.toString() !== familyId) {
      // Xóa student khỏi family cũ
      const oldFamily = await Family.findById(currentStudent.family);
      if (oldFamily) {
        oldFamily.students = oldFamily.students.filter(s => s.toString() !== req.params.id);
        await oldFamily.save();
        // Xóa student khỏi students của từng parent trong family cũ
        for (const parentObj of oldFamily.parents) {
          const parent = await Parent.findById(parentObj.parent);
          if (parent) {
            parent.students = parent.students.filter(s => s.toString() !== req.params.id);
            await parent.save();
          }
        }
      }
    }

    // Thêm student vào family mới
    const newFamily = await Family.findById(familyId);
    if (newFamily) {
      if (!newFamily.students.includes(req.params.id)) {
        newFamily.students.push(req.params.id);
        await newFamily.save();
      }
      // Thêm student vào students của từng parent trong family mới
      for (const parentObj of newFamily.parents) {
        const parent = await Parent.findById(parentObj.parent);
        if (parent && !parent.students.includes(req.params.id)) {
          parent.students.push(req.params.id);
          await parent.save();
        }
      }
    }
  } else if (parentIds.length > 0) {
    // Nếu không có familyId nhưng có parents, tạo family mới
    const family = new Family({
      familyCode: `FAM${Date.now()}`,
      parents: parentIds.map(parentId => ({
        parent: parentId,
        relationship: 'Khác'
      })),
      students: [req.params.id]
    });
    const newFamily = await family.save();
    familyId = newFamily._id;
    studentData.family = familyId;

    // Xóa student khỏi family cũ nếu có
    if (currentStudent.family) {
      const oldFamily = await Family.findById(currentStudent.family);
      if (oldFamily) {
        oldFamily.students = oldFamily.students.filter(s => s.toString() !== req.params.id);
        await oldFamily.save();
        // Xóa student khỏi students của từng parent trong family cũ
        for (const parentObj of oldFamily.parents) {
          const parent = await Parent.findById(parentObj.parent);
          if (parent) {
            parent.students = parent.students.filter(s => s.toString() !== req.params.id);
            await parent.save();
          }
        }
      }
    }
  }

  // Cập nhật student
  const student = await Student.findByIdAndUpdate(req.params.id, studentData, { new: true });
  res.json(student);
});

// Bỏ gia đình khỏi học sinh (PATCH /students/:id/remove-family)
exports.removeFamilyFromStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Lấy thông tin Student
  const student = await Student.findById(id);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  if (!student.family) {
    return res.status(400).json({ message: 'Học sinh hiện không thuộc gia đình nào' });
  }

  // 2. Gỡ student ra khỏi Family.students
  const family = await Family.findById(student.family);
  if (family) {
    family.students = family.students.filter(s => s.toString() !== id);
    await family.save();
  }

  // 3. Xoá liên kết ở phía Student
  student.family = undefined;
  await student.save();

  res.json({ message: 'Đã bỏ gia đình khỏi học sinh', student });
});

// Delete a Student
exports.deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }
  res.json({ message: 'Student deleted successfully' });
});