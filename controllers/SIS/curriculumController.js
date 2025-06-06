const mongoose = require("mongoose");
const Curriculum = require("../../models/Curriculum");
const Subject = require("../../models/Subject");
const School = require("../../models/School");
const EducationalSystem = require("../../models/EducationalSystem");

// Get all curriculums
exports.getAllCurriculums = async (req, res) => {
  try {
    const { school, educationalSystem } = req.query;
    const query = {};

    if (school) query.school = school;
    if (educationalSystem) query.educationalSystem = educationalSystem;

    const curriculums = await Curriculum.find(query)
      .populate('educationalSystem', 'name')
      .populate({
        path: 'subjects.subject',
        select: 'name code needFunctionRoom rooms',
        populate: {
          path: 'rooms',
          select: 'name type'
        }
      });
    res.json({ data: curriculums });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new curriculum
exports.createCurriculum = async (req, res) => {
  try {
    const { name, description, educationalSystem: educationalSystemId, gradeLevel, subjects, schoolId } = req.body;

    // Check if curriculum already exists
    const existingCurriculum = await Curriculum.findOne({
      name,
      educationalSystem: educationalSystemId
    });
    if (existingCurriculum) {
      return res.status(400).json({ message: "Curriculum already exists in this educational system" });
    }

    // Create new curriculum
    const curriculum = new Curriculum({
      name,
      description,
      educationalSystem: educationalSystemId,
      gradeLevel,
      subjects
    });
    await curriculum.save();

    // Update school's curriculums array
    await School.findByIdAndUpdate(
      schoolId,
      { $push: { curriculums: curriculum._id } }
    );

    // Update educational system's curriculums array
    await EducationalSystem.findByIdAndUpdate(
      educationalSystemId,
      { $push: { curriculums: curriculum._id } }
    );

    res.status(201).json(curriculum);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update curriculum
exports.updateCurriculum = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, gradeLevel, educationalSystem: newEducationalSystemId } = req.body;

    const curriculum = await Curriculum.findById(id);
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    // If educational system is being changed
    if (newEducationalSystemId && newEducationalSystemId !== curriculum.educationalSystem.toString()) {
      // Remove curriculum from old educational system
      await EducationalSystem.findByIdAndUpdate(
        curriculum.educationalSystem,
        { $pull: { curriculums: curriculum._id } }
      );

      // Add curriculum to new educational system
      await EducationalSystem.findByIdAndUpdate(
        newEducationalSystemId,
        { $push: { curriculums: curriculum._id } }
      );

      curriculum.educationalSystem = newEducationalSystemId;
    }

    // Check for duplicate name in the same educational system
    const existingCurriculum = await Curriculum.findOne({
      name,
      educationalSystem: curriculum.educationalSystem,
      _id: { $ne: id }
    });
    if (existingCurriculum) {
      return res.status(400).json({ message: "Curriculum name already exists in this educational system" });
    }

    curriculum.name = name;
    curriculum.description = description;
    curriculum.gradeLevel = gradeLevel;
    // curriculum.subjects = subjects; // Removed to preserve existing subjects
    await curriculum.save();

    res.json(curriculum);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete curriculum
exports.deleteCurriculum = async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id);
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    // Remove curriculum from school's curriculums array
    const school = await School.findOne({ curriculums: curriculum._id });
    if (school) {
      await School.findByIdAndUpdate(
        school._id,
        { $pull: { curriculums: curriculum._id } }
      );
    }

    // Remove curriculum from educational system's curriculums array
    await EducationalSystem.findByIdAndUpdate(
      curriculum.educationalSystem,
      { $pull: { curriculums: curriculum._id } }
    );

    await curriculum.remove();
    res.json({ message: "Curriculum deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách chương trình học
exports.getCurriculums = async (req, res) => {
  try {
    const curriculums = await Curriculum.find()
      .populate("educationalSystem", "name")
      .populate({
        path: 'subjects.subject',
        select: 'name code needFunctionRoom rooms',
        populate: {
          path: 'rooms',
          select: 'name type'
        }
      })
      .sort({ createdAt: -1 });
    return res.json(curriculums);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy chi tiết một chương trình học
exports.getCurriculumById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const curriculum = await Curriculum.findById(id)
      .populate("educationalSystem", "name")
      .populate({
        path: 'subjects.subject',
        select: 'name code needFunctionRoom rooms',
        populate: {
          path: 'rooms',
          select: 'name type'
        }
      });

    if (!curriculum) {
      return res.status(404).json({ message: "Không tìm thấy chương trình học" });
    }

    return res.json(curriculum);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Thêm môn học vào chương trình
exports.addSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { subjectId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const [curriculum, subject] = await Promise.all([
      Curriculum.findById(id),
      Subject.findById(subjectId)
    ]);

    if (!curriculum) {
      return res.status(404).json({ message: "Không tìm thấy chương trình học" });
    }

    if (!subject) {
      return res.status(404).json({ message: "Không tìm thấy môn học" });
    }

    const existingSubjectIndex = curriculum.subjects.findIndex(s => s.subject.toString() === subjectId);
    if (existingSubjectIndex !== -1) {
      return res.status(400).json({ message: "Môn học đã tồn tại trong chương trình" });
    }

    curriculum.subjects.push({
      subject: subjectId,
    });

    const existingCurriculumIndex = subject.curriculums.findIndex(c => c.curriculum.toString() === id);
    if (existingCurriculumIndex === -1) {
      subject.curriculums.push({
        curriculum: id,
      });
    }

    // Thêm môn được chọn vào curriculum & ngược lại
    curriculum.subjects.push({ subject: subjectId });
    if (!subject.curriculums.some(c => c.curriculum.toString() === id)) {
      subject.curriculums.push({ curriculum: id });
    }

    // Nếu là môn học cha → lan toả cho các môn con
    if (subject.isParentSubject && subject.subSubjects.length) {
      const childs = await Subject.find({ _id: { $in: subject.subSubjects } });

      for (const child of childs) {
        if (!curriculum.subjects.some(s => s.subject.toString() === child._id.toString())) {
          curriculum.subjects.push({ subject: child._id });
        }
        if (!child.curriculums.some(c => c.curriculum.toString() === id)) {
          child.curriculums.push({ curriculum: id });
          await child.save();
        }
      }
    }

    await Promise.all([curriculum.save(), subject.save()]);

    const updatedCurriculum = await Curriculum.findById(id)
      .populate("educationalSystem", "name")
      .populate({
        path: "subjects.subject",
        select: "name code"
      });

    // Filter out subjects where population failed (subject is null/undefined)
    updatedCurriculum.subjects = updatedCurriculum.subjects.filter((s) => s.subject);

    return res.json(updatedCurriculum);
  } catch (err) {
    console.error('Lỗi khi thêm môn học vào chương trình:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Xóa môn học khỏi chương trình
// In removeSubject
exports.removeSubject = async (req, res) => {
  try {
    const { id, subjectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const curriculum = await Curriculum.findById(id);
    if (!curriculum) {
      return res.status(404).json({ message: "Không tìm thấy chương trình học" });
    }

    curriculum.subjects = curriculum.subjects.filter(
      (s) => s.subject.toString() !== subjectId
    );

    // Lấy subject
    const subject = await Subject.findById(subjectId);
    // Xoá subject khỏi curriculum
    curriculum.subjects = curriculum.subjects.filter(s => s.subject.toString() !== subjectId);
    subject.curriculums = subject.curriculums.filter(c => c.curriculum.toString() !== id);

    // Nếu là môn cha → xoá luôn môn con
    if (subject.isParentSubject && subject.subSubjects.length) {
      const childs = await Subject.find({ _id: { $in: subject.subSubjects } });
      for (const child of childs) {
        curriculum.subjects = curriculum.subjects.filter(s => s.subject.toString() !== child._id.toString());
        child.curriculums = child.curriculums.filter(c => c.curriculum.toString() !== id);
        await child.save();
      }
    }

    await Promise.all([curriculum.save(), subject.save()]);

    const updatedCurriculum = await Curriculum.findById(id)
      .populate("educationalSystem", "name")
      .populate({
        path: "subjects.subject",
        select: "name code"
      });

    // Filter out subjects where population failed (subject is null/undefined)
    updatedCurriculum.subjects = updatedCurriculum.subjects.filter((s) => s.subject);

    return res.json(updatedCurriculum);
  } catch (err) {
    console.error('Lỗi khi xóa môn học khỏi chương trình:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Lấy danh sách môn học của một chương trình học
exports.getSubjectsByCurriculum = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const curriculum = await Curriculum.findById(id)
      .populate({
        path: "subjects.subject",
        select: "name code description"
      });

    if (!curriculum) {
      return res.status(404).json({ message: "Không tìm thấy chương trình học" });
    }

    // Trả về danh sách môn học đã được populate
    const subjects = curriculum.subjects.map(s => ({
      _id: s.subject._id,
      name: s.subject.name,
      code: s.subject.code,
      description: s.subject.description,
    }));

    return res.json(subjects);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};