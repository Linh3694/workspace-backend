const asyncHandler = require('express-async-handler');
const Student = require('../../models/Student');
const User = require('../../models/Users');
const Family = require('../../models/Family');
const Parent = require('../../models/Parent');
const Photo = require('../../models/Photo');

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

  // Tạo student trước (không lưu avatarUrl vào Student)
  const student = new Student(studentData);
  const newStudent = await student.save();

  // Xử lý avatar - Lưu vào Photo model nếu có
  if (req.file && req.body.schoolYear) {
    const photoData = {
      student: newStudent._id,
      schoolYear: req.body.schoolYear,
      photoUrl: `/uploads/Students/${req.file.filename}`,
      description: 'Avatar học sinh'
    };
    await Photo.create(photoData);
    console.log('Đã tạo photo cho student:', newStudent._id);
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

  if (parentIds.length > 0) {
    newStudent.parents = parentIds;
    await newStudent.save();
  }

  // Xử lý Family
  let familyId = studentData.family;
  if (familyId) {
    // Nếu có familyId, thêm student vào family
    const family = await Family.findById(familyId);
    if (family) {
      family.students.push(newStudent._id);
      await family.save();
      // Thêm student vào students của từng parent trong family
      for (const parentObj of family.parents) {
        const parent = await Parent.findById(parentObj.parent);
        if (parent && !parent.students.includes(newStudent._id)) {
          parent.students.push(newStudent._id);
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
      students: [newStudent._id]
    });
    const newFamily = await family.save();
    familyId = newFamily._id;
    newStudent.family = familyId;
    await newStudent.save();
  }

  console.log('Final student created:', newStudent);

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

  // Xử lý avatar mới (lưu vào Photo model)
  if (req.file && req.body.schoolYear) {
    // Kiểm tra xem đã có photo cho student trong năm học này chưa
    const existingPhoto = await Photo.findOne({
      student: req.params.id,
      schoolYear: req.body.schoolYear
    });

    if (existingPhoto) {
      // Cập nhật photo cũ
      existingPhoto.photoUrl = `/uploads/Students/${req.file.filename}`;
      existingPhoto.updatedAt = Date.now();
      await existingPhoto.save();
    } else {
      // Tạo photo mới
      const photoData = {
        student: req.params.id,
        schoolYear: req.body.schoolYear,
        photoUrl: `/uploads/Students/${req.file.filename}`,
        description: 'Avatar học sinh'
      };
      await Photo.create(photoData);
    }
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

// Helper function to get current school year
const getCurrentSchoolYear = async () => {
  const SchoolYear = require('../../models/SchoolYear');
  const currentYear = await SchoolYear.findOne({ isActive: true });
  return currentYear ? currentYear._id : null;
};

// Search students by query (studentCode or name)
exports.searchStudents = asyncHandler(async (req, res) => {
  const { q, schoolYear } = req.query;
  
  if (!q || q.trim() === '') {
    return res.json([]);
  }

  const searchQuery = q.trim();
  
  try {
    // First find students
    const students = await Student.find({
      $or: [
        { studentCode: { $regex: searchQuery, $options: 'i' } },
        { name: { $regex: searchQuery, $options: 'i' } }
      ]
    })
    .populate('class', 'className')
    .select('_id studentCode name email')
    .limit(10);

    // Get current school year if not provided (Tự động lấy năm học hiện tại)
    let currentSchoolYear = schoolYear;
    if (!currentSchoolYear) {
      currentSchoolYear = await getCurrentSchoolYear();
      console.log('Auto-selected current school year:', currentSchoolYear);
    }

    // Get photos for these students in current school year
    const studentIds = students.map(s => s._id);
    let photos = [];
    
    if (currentSchoolYear) {
      photos = await Photo.find({
        student: { $in: studentIds },
        schoolYear: currentSchoolYear
      });
    }

    // Fallback: Nếu không có ảnh năm hiện tại, lấy ảnh mới nhất
    if (photos.length === 0) {
      const latestPhotos = await Photo.aggregate([
        { $match: { student: { $in: studentIds } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$student', photoUrl: { $first: '$photoUrl' } } }
      ]);
      photos = latestPhotos.map(p => ({ student: p._id, photoUrl: p.photoUrl }));
    }

    // Map data to match frontend expectations
    const mappedStudents = students.map(student => {
      const photo = photos.find(p => p.student.toString() === student._id.toString());
      
      return {
        _id: student._id,
        studentId: student.studentCode,
        fullName: student.name,
        email: student.email,
        className: student.class && student.class.length > 0 ? student.class[0].className : 'N/A',
        photoUrl: photo ? photo.photoUrl : null
      };
    });

    res.json(mappedStudents);
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({ error: 'L�gi khi tìm kiếm học sinh' });
  }
});

// Upload ảnh học sinh cho năm học cụ thể
exports.uploadStudentPhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { schoolYear } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'Không có file ảnh được upload' });
  }

  if (!schoolYear) {
    return res.status(400).json({ message: 'Thiếu thông tin năm học' });
  }

  // Kiểm tra student có tồn tại không
  const student = await Student.findById(id);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  // Kiểm tra xem đã có photo cho student trong năm học này chưa
  const existingPhoto = await Photo.findOne({
    student: id,
    schoolYear: schoolYear
  });

  if (existingPhoto) {
    // Cập nhật photo cũ
    existingPhoto.photoUrl = `/uploads/Students/${req.file.filename}`;
    existingPhoto.updatedAt = Date.now();
    await existingPhoto.save();
    res.json({ 
      message: 'Cập nhật ảnh học sinh thành công', 
      photo: existingPhoto 
    });
  } else {
    // Tạo photo mới
    const photoData = {
      student: id,
      schoolYear: schoolYear,
      photoUrl: `/uploads/Students/${req.file.filename}`,
      description: 'Avatar học sinh'
    };
    const newPhoto = await Photo.create(photoData);
    res.json({ 
      message: 'Upload ảnh học sinh thành công', 
      photo: newPhoto 
    });
  }
});

// Lấy ảnh học sinh theo năm học
exports.getStudentPhotoByYear = asyncHandler(async (req, res) => {
  const { id, schoolYear } = req.params;

  const photo = await Photo.findOne({
    student: id,
    schoolYear: schoolYear
  }).populate('student', 'name studentCode')
    .populate('schoolYear', 'code');

  if (!photo) {
    return res.status(404).json({ message: 'Không tìm thấy ảnh học sinh cho năm học này' });
  }

  res.json(photo);
});

// Lấy tất cả ảnh của học sinh (tất cả năm học)
exports.getAllStudentPhotos = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const photos = await Photo.find({
    student: id
  }).populate('schoolYear', 'code')
    .sort({ createdAt: -1 });

  res.json(photos);
});

// Lấy ảnh hiện tại của học sinh (năm học hiện tại hoặc mới nhất)
exports.getCurrentStudentPhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    // Lấy năm học hiện tại
    const currentSchoolYear = await getCurrentSchoolYear();
    let photo = null;

    if (currentSchoolYear) {
      // Tìm ảnh của năm học hiện tại
      photo = await Photo.findOne({
        student: id,
        schoolYear: currentSchoolYear
      }).populate('schoolYear', 'code');
    }

    // Fallback: Nếu không có ảnh năm hiện tại, lấy ảnh mới nhất
    if (!photo) {
      photo = await Photo.findOne({
        student: id
      }).populate('schoolYear', 'code')
        .sort({ createdAt: -1 });
    }

    if (!photo) {
      return res.status(404).json({ message: 'Không tìm thấy ảnh học sinh' });
    }

    res.json(photo);
  } catch (error) {
    console.error('Error getting current student photo:', error);
    res.status(500).json({ error: 'Lỗi khi lấy ảnh học sinh' });
  }
});

// Delete a Student
exports.deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }
  res.json({ message: 'Student deleted successfully' });
});