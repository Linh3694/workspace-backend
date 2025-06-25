const mongoose = require("mongoose");
const Subject = require("../../models/Subject");
const Curriculum = require("../../models/Curriculum");
const Room = require("../../models/Room");
const GradeLevel = require("../../models/GradeLevel");
const School = require("../../models/School");
const {
  syncTimetableAfterRoomUpdate,
} = require("../../services/timetableSync.service");

// Lấy tất cả môn học
exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate('rooms', 'name type')
      .populate('school', 'name code type')
      .populate('gradeLevels', 'name code')
      .populate('parentSubject', 'name code')
      .populate('subSubjects', 'name code')
      .populate({
        path: 'curriculums.curriculum',
        select: 'name gradeLevel description'
      });
    res.json({ data: subjects });
  } catch (error) {
    console.error('Error getting subjects:', error);
    res.status(500).json({ message: "Không thể lấy danh sách môn học" });
  }
};

// Tạo môn học mới
exports.createSubject = async (req, res) => {
  try {
    const {
      name,
      code,
      school,
      gradeLevels,
      needFunctionRoom,
      rooms,
      isParentSubject,
      parentSubject,
      description
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Tên môn học là bắt buộc" });
    }

    if (!school) {
      return res.status(400).json({ message: "Trường là bắt buộc" });
    }

    if (!gradeLevels || gradeLevels.length === 0) {
      return res.status(400).json({ message: "Phải chọn ít nhất một khối lớp" });
    }

    // Kiểm tra school có tồn tại không
    const schoolExists = await School.findById(school);
    if (!schoolExists) {
      return res.status(400).json({ message: "Trường không tồn tại" });
    }

    // Kiểm tra các khối lớp có tồn tại không và thuộc trường đã chọn
    const validGradeLevels = await GradeLevel.find({
      _id: { $in: gradeLevels },
      school: school
    });

    if (validGradeLevels.length !== gradeLevels.length) {
      return res.status(400).json({ message: "Một số khối lớp không hợp lệ hoặc không thuộc trường đã chọn" });
    }

    // Kiểm tra mã môn học đã tồn tại chưa
    if (code) {
      const existingSubject = await Subject.findOne({ code });
      if (existingSubject) {
        return res.status(400).json({ message: "Mã môn học đã tồn tại" });
      }
    }

    // Kiểm tra parentSubject nếu có
    if (parentSubject) {
      const parentExists = await Subject.findById(parentSubject);
      if (!parentExists) {
        return res.status(400).json({ message: "Môn học cha không tồn tại" });
      }
      if (!parentExists.isParentSubject) {
        return res.status(400).json({ message: "Môn học được chọn không phải là môn học cha" });
      }
    }

    // Xác định phòng học khi cần phòng chức năng
    let assignedRooms = [];
    if (needFunctionRoom && Array.isArray(rooms) && rooms.length) {
      assignedRooms = rooms;
    }

    const newSubject = await Subject.create({
      name,
      code,
      school,
      gradeLevels,
      needFunctionRoom: needFunctionRoom || false,
      rooms: assignedRooms,
      curriculums: [],
      isParentSubject: isParentSubject || false,
      parentSubject: parentSubject || null,
      subSubjects: [],
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Nếu là môn học con, cập nhật môn học cha
    if (parentSubject) {
      await Subject.findByIdAndUpdate(parentSubject, {
        $push: { subSubjects: newSubject._id }
      });
    }

    // Populate các trường liên quan trước khi trả về
    const populatedSubject = await Subject.findById(newSubject._id)
      .populate('rooms', 'name type')
      .populate('school', 'name code type')
      .populate('gradeLevels', 'name code')
      .populate('parentSubject', 'name code')
      .populate('subSubjects', 'name code')
      .populate({
        path: 'curriculums.curriculum',
        select: 'name gradeLevel description'
      });

    // ---- Sync rooms <- subject (1 chiều) ----
    if (assignedRooms.length) {
      await Room.updateMany(
        { _id: { $in: assignedRooms } },
        { $addToSet: { subjects: newSubject._id } }
      );
    }
    if (assignedRooms.length) {
      await syncTimetableAfterRoomUpdate({
        subjectId: newSubject._id,
        roomId: assignedRooms[0],
      });
    }

    // Sau khi cập nhật subject.gradeLevels
    if (Array.isArray(gradeLevels)) {
      // Thêm subject vào trường subjects của các gradeLevel mới
      await GradeLevel.updateMany(
        { _id: { $in: gradeLevels } },
        { $addToSet: { subjects: newSubject._id } }
      );
    }

    res.status(201).json({ data: populatedSubject });
  } catch (error) {
    console.error('Error creating subject:', error);
    res.status(400).json({ message: "Không thể tạo môn học mới" });
  }
};

// Lấy danh sách môn học
exports.getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate('rooms', 'name type')
      .populate('school', 'name code type')
      .populate('gradeLevels', 'name code')
      .populate({
        path: 'curriculums.curriculum',
        select: 'name educationalSystem',
        populate: {
          path: 'educationalSystem',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    // Chuyển đổi dữ liệu trước khi trả về
    const formattedSubjects = subjects.map(subject => {
      const subjectObj = subject.toObject();
      return {
        ...subjectObj,
        curriculums: subjectObj.curriculums.map(curr => ({
          ...curr,
          curriculumName: curr.curriculum ? curr.curriculum.name : 'Chưa có chương trình'
        }))
      };
    });

    return res.json({ data: formattedSubjects });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách môn học:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Lấy thông tin một môn học
exports.getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const subject = await Subject.findById(id)
      .populate('school', 'name code type')
      .populate('gradeLevels', 'name code')
      .populate({
        path: 'curriculums.curriculum',
        select: 'name educationalSystem',
        populate: {
          path: 'educationalSystem',
          select: 'name'
        }
      });

    if (!subject) {
      return res.status(404).json({ message: "Không tìm thấy môn học" });
    }

    // Chuyển đổi dữ liệu trước khi trả về
    const subjectObj = subject.toObject();
    const formattedSubject = {
      ...subjectObj,
      curriculums: subjectObj.curriculums.map(curr => ({
        ...curr,
        curriculumName: curr.curriculum ? curr.curriculum.name : 'Chưa có chương trình'
      }))
    };

    return res.json({ data: formattedSubject });
  } catch (err) {
    console.error('Lỗi khi lấy thông tin môn học:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Cập nhật môn học
exports.updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      school,
      gradeLevels,
      needFunctionRoom,
      rooms,
      isParentSubject,
      parentSubject,
      description
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    if (!name) {
      return res.status(400).json({ message: "Tên môn học là bắt buộc" });
    }

    // Kiểm tra school có tồn tại không
    if (school) {
      const schoolExists = await School.findById(school);
      if (!schoolExists) {
        return res.status(400).json({ message: "Trường không tồn tại" });
      }
    }

    // Kiểm tra các khối lớp
    if (gradeLevels && gradeLevels.length > 0) {
      const validGradeLevels = await GradeLevel.find({
        _id: { $in: gradeLevels },
        school: school
      });

      if (validGradeLevels.length !== gradeLevels.length) {
        return res.status(400).json({ message: "Một số khối lớp không hợp lệ hoặc không thuộc trường đã chọn" });
      }
    }

    // Kiểm tra mã môn học có bị trùng không
    if (code) {
      const existingSubject = await Subject.findOne({
        code,
        _id: { $ne: id }
      });
      if (existingSubject) {
        return res.status(400).json({ message: "Mã môn học đã tồn tại" });
      }
    }

    // Kiểm tra parentSubject nếu có
    if (parentSubject) {
      const parentExists = await Subject.findById(parentSubject);
      if (!parentExists) {
        return res.status(400).json({ message: "Môn học cha không tồn tại" });
      }
      if (!parentExists.isParentSubject) {
        return res.status(400).json({ message: "Môn học được chọn không phải là môn học cha" });
      }
    }

    // Xác định phòng học (chỉ khi cần phòng chức năng)
    let assignedRooms = [];
    if (needFunctionRoom && Array.isArray(rooms) && rooms.length) {
      assignedRooms = rooms;
    }

    const updateData = {
      name,
      code,
      school,
      gradeLevels,
      needFunctionRoom: needFunctionRoom || false,
      rooms: assignedRooms,
      isParentSubject: isParentSubject || false,
      parentSubject: parentSubject || null,
      description,
      updatedAt: new Date()
    };
    const oldSubject = await Subject.findById(id).lean();
    const prevRooms = oldSubject.rooms.map(r => r.toString());

    const updatedSubject = await Subject.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate('rooms', 'name type')
      .populate('school', 'name code type')
      .populate('gradeLevels', 'name code')
      .populate('parentSubject', 'name code')
      .populate('subSubjects', 'name code')
      .populate({
        path: 'curriculums.curriculum',
        select: 'name gradeLevel description'
      });

    if (!updatedSubject) {
      return res.status(404).json({ message: "Không tìm thấy môn học" });
    }
    const newRooms = assignedRooms.map(r => r.toString());
    const roomsToAdd = newRooms.filter(r => !prevRooms.includes(r));
    const roomsToRemove = prevRooms.filter(r => !newRooms.includes(r));

    if (roomsToAdd.length) {
      await Room.updateMany(
        { _id: { $in: roomsToAdd } },
        { $addToSet: { subjects: id } }
      );
    }
    for (const rId of roomsToAdd) {
      await syncTimetableAfterRoomUpdate({ subjectId: id, roomId: rId });
    }
    if (roomsToRemove.length) {
      await Room.updateMany(
        { _id: { $in: roomsToRemove } },
        { $pull: { subjects: id } }
      );
    }

    // Sau khi cập nhật subject.gradeLevels
    if (Array.isArray(gradeLevels)) {
      // Thêm subject vào trường subjects của các gradeLevel mới
      await GradeLevel.updateMany(
        { _id: { $in: gradeLevels } },
        { $addToSet: { subjects: updatedSubject._id } }
      );

      // Xóa subject khỏi trường subjects của các gradeLevel cũ không còn liên kết
      const oldGradeLevels = oldSubject.gradeLevels.map(id => id.toString());
      const newGradeLevels = gradeLevels.map(id => id.toString());
      const removedGradeLevels = oldGradeLevels.filter(id => !newGradeLevels.includes(id));

      if (removedGradeLevels.length) {
        await GradeLevel.updateMany(
          { _id: { $in: removedGradeLevels } },
          { $pull: { subjects: updatedSubject._id } }
        );
      }
    }

    res.json({ data: updatedSubject });
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(400).json({ message: "Không thể cập nhật môn học" });
  }
};

// Xóa môn học
exports.deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const subject = await Subject.findById(id);
    if (!subject) {
      return res.status(404).json({ message: "Không tìm thấy môn học" });
    }

    // Nếu là môn học cha, kiểm tra xem có môn học con không
    if (subject.isParentSubject && subject.subSubjects.length > 0) {
      return res.status(400).json({ message: "Không thể xóa môn học cha khi còn môn học con" });
    }

    // Nếu là môn học con, xóa khỏi danh sách môn học con của môn học cha
    if (subject.parentSubject) {
      await Subject.findByIdAndUpdate(subject.parentSubject, {
        $pull: { subSubjects: id }
      });
    }

    // Xóa subject
    await Subject.findByIdAndDelete(id);

    // Xóa tham chiếu trong curriculum
    await Curriculum.updateMany(
      { "subjects.subject": id },
      { $pull: { subjects: { subject: id } } }
    );

    return res.json({ data: { message: "Đã xóa môn học thành công" } });
  } catch (error) {
    console.error("Error deleting subject:", error);
    return res.status(500).json({ message: "Không thể xóa môn học" });
  }
};

// Lấy danh sách môn học cha
exports.getParentSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({ isParentSubject: true })
      .populate('school', 'name code type')
      .populate('gradeLevels', 'name code')
      .populate('subSubjects', 'name code');
    res.json({ data: subjects });
  } catch (error) {
    console.error('Error getting parent subjects:', error);
    res.status(500).json({ message: "Không thể lấy danh sách môn học cha" });
  }
};

// Lấy danh sách môn học con của một môn học cha
exports.getSubSubjects = async (req, res) => {
  try {
    const { parentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const parentSubject = await Subject.findById(parentId)
      .populate('subSubjects');

    if (!parentSubject) {
      return res.status(404).json({ message: "Không tìm thấy môn học cha" });
    }

    res.json({ data: parentSubject.subSubjects });
  } catch (error) {
    console.error('Error getting sub subjects:', error);
    res.status(500).json({ message: "Không thể lấy danh sách môn học con" });
  }
};

// Bulk upload subjects from frontend Excel import
exports.bulkUploadSubjects = async (req, res) => {
  console.log(req.body);
  try {
    const rows = req.body; // array of plain objects
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "Payload must be a non-empty array" });
    }

    const results = {
      inserted: 0,
      skipped: 0,
      errors: []
    };

    // Pass 1: Create all subjects first
    const createdSubjects = new Map(); // code -> subject
    
    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const {
        name,
        code,
        schoolCode,
        gradeLevelCodes = [],
        needFunctionRoom = false,
        roomCodes = [],
        isParentSubject = false,
        parentSubjectCode,
        description
      } = row;

      // Validate required fields
      if (!name || !schoolCode || !gradeLevelCodes.length) {
        results.skipped += 1;
        results.errors.push(`Row ${line}: missing required fields`);
        continue;
      }

      // Validate parent-child relationship logic
      if (isParentSubject && parentSubjectCode) {
        results.skipped += 1;
        results.errors.push(`Row ${line}: môn học cha không thể có parentSubjectCode`);
        continue;
      }

      // Lookup School by code
      console.log(`Looking for school with code/name: ${schoolCode}`);
      let school = await School.findOne({ code: schoolCode });
      if (!school) {
        school = await School.findOne({ name: schoolCode });
      }
      if (!school) {
        // Debug: list all schools
        const allSchools = await School.find({}, 'name code');
        console.log('Available schools:', allSchools.map(s => ({ name: s.name, code: s.code })));
        results.skipped += 1;
        results.errors.push(`Row ${line}: school code not found (${schoolCode})`);
        continue;
      }
      console.log(`Found school:`, { name: school.name, code: school.code, id: school._id });

      // Lookup grade levels by code within the same school
      console.log(`Looking for grade levels: ${gradeLevelCodes.join(', ')} in school ${school.name}`);
      const gradeLevels = await GradeLevel.find({
        $or: [{ code: { $in: gradeLevelCodes } }, { name: { $in: gradeLevelCodes } }],
        school: school._id,
      });
      console.log(`Found ${gradeLevels.length} grade levels:`, gradeLevels.map(g => ({ name: g.name, code: g.code })));
      if (gradeLevels.length !== gradeLevelCodes.length) {
        // Debug: list all grade levels for this school
        const allGradeLevels = await GradeLevel.find({ school: school._id }, 'name code');
        console.log('Available grade levels for this school:', allGradeLevels.map(g => ({ name: g.name, code: g.code })));
        results.skipped += 1;
        results.errors.push(`Row ${line}: some gradeLevel codes invalid for school ${schoolCode}. Expected: ${gradeLevelCodes.join(', ')}, Found: ${gradeLevels.map(g => g.name || g.code).join(', ')}`);
        continue;
      }

      // Prevent duplicate code
      if (code) {
        const dup = await Subject.findOne({ code });
        if (dup) {
          results.skipped += 1;
          results.errors.push(`Row ${line}: subject code already exists (${code})`);
          continue;
        }
      }

      // Determine rooms
      let rooms = [];
      if (!needFunctionRoom) {
        const homeroom = await Room.findOne({ isHomeroom: true });
        if (homeroom) rooms = [homeroom._id];
      } else if (roomCodes.length) {
        const foundRooms = await Room.find({ code: { $in: roomCodes } });
        rooms = foundRooms.map(r => r._id);
      }

      const newSubject = await Subject.create({
        name,
        code,
        school: school._id,
        gradeLevels: gradeLevels.map(g => g._id),
        needFunctionRoom: !!needFunctionRoom,
        rooms,
        curriculums: [],
        isParentSubject: !!isParentSubject,
        parentSubject: null, // Will be set in pass 2
        subSubjects: [],
        description: description || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // ---- THÊM PHẦN ĐỒNG BỘ HÓA ----
      // Đồng bộ với GradeLevel
      if (gradeLevels.length) {
        await GradeLevel.updateMany(
          { _id: { $in: gradeLevels.map(g => g._id) } },
          { $addToSet: { subjects: newSubject._id } }
        );
      }

      // Đồng bộ với Room nếu có
      if (rooms.length) {
        await Room.updateMany(
          { _id: { $in: rooms } },
          { $addToSet: { subjects: newSubject._id } }
        );
      }

      if (code) {
        createdSubjects.set(code, newSubject);
      }
      results.inserted += 1;
    }

    // Pass 2: Set up parent-child relationships
    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const { code, parentSubjectCode, isParentSubject } = row;

      if (!isParentSubject && parentSubjectCode) {
        // This is a child subject, find its parent
        const parentSubject = createdSubjects.get(parentSubjectCode) || 
                             await Subject.findOne({ code: parentSubjectCode });
        
        if (!parentSubject) {
          results.errors.push(`Row ${line}: parent subject code not found (${parentSubjectCode})`);
          continue;
        }

        if (!parentSubject.isParentSubject) {
          results.errors.push(`Row ${line}: parent subject must be marked as parent (${parentSubjectCode})`);
          continue;
        }

        const childSubject = createdSubjects.get(code) || await Subject.findOne({ code });
        if (childSubject) {
          // Update child to point to parent
          await Subject.findByIdAndUpdate(childSubject._id, {
            parentSubject: parentSubject._id
          });

          // Update parent to include this child
          await Subject.findByIdAndUpdate(parentSubject._id, {
            $addToSet: { subSubjects: childSubject._id }
          });
        }
      }
    }

    return res.json({ data: results });
  } catch (err) {
    console.error('Error bulk uploading subjects:', err);
    return res.status(500).json({ message: 'Không thể bulk upload môn học' });
  }
};