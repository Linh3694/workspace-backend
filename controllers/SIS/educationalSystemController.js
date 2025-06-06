const mongoose = require("mongoose");
const EducationalSystem = require("../../models/EducationalSystem");
const School = require("../../models/School");

// Get all educational systems
exports.getAllEducationalSystems = async (req, res) => {
  try {
    const { school } = req.query;
    const query = school ? { school } : {};

    const educationalSystems = await EducationalSystem.find(query)
      .populate('school', 'name code type')
      .populate('curriculums', 'name');
    res.json({ data: educationalSystems });
  } catch (error) {
    console.error('Error in getAllEducationalSystems:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create new educational system
exports.createEducationalSystem = async (req, res) => {
  try {
    const { name, description, schoolId } = req.body;
    console.log('Creating educational system with data:', { name, description, schoolId });

    // Check if school exists
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Check if educational system already exists in this school
    const existingSystem = await EducationalSystem.findOne({
      name,
      school: schoolId
    });
    if (existingSystem) {
      return res.status(400).json({ message: "Educational system already exists in this school" });
    }

    // Create new educational system
    const educationalSystem = new EducationalSystem({
      name,
      description,
      school: schoolId,
    });
    await educationalSystem.save();
    console.log('Created educational system:', educationalSystem);

    // Update school's educationalSystems array and get updated school
    const updatedSchool = await School.findByIdAndUpdate(
      schoolId,
      { $push: { educationalSystems: educationalSystem._id } },
      { new: true }
    ).populate('educationalSystems');

    console.log('Updated school:', updatedSchool);

    // Fetch the created educational system with populated fields
    const populatedSystem = await EducationalSystem.findById(educationalSystem._id)
      .populate('school', 'name code type')
      .populate('curriculums', 'name');

    res.status(201).json({
      educationalSystem: populatedSystem,
      school: updatedSchool
    });
  } catch (error) {
    console.error('Error in createEducationalSystem:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update educational system
exports.updateEducationalSystem = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    console.log('Updating educational system:', { id, updateData });

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid educational system ID" });
    }

    // Find the educational system
    let educationalSystem = await EducationalSystem.findById(id);
    if (!educationalSystem) {
      return res.status(404).json({ message: "Educational system not found" });
    }
    const oldSchoolId = educationalSystem.school ? educationalSystem.school.toString() : null;

    // Handle school change - support both schoolId and school in request
    const newSchoolId = updateData.schoolId || updateData.school;
    if (newSchoolId !== oldSchoolId) {
      console.log('School change detected:', {
        oldSchool: educationalSystem.school,
        newSchool: newSchoolId
      });

      // Check if new school exists
      const newSchool = await School.findById(newSchoolId);
      if (!newSchool) {
        return res.status(404).json({ message: "New school not found" });
      }

      // Remove from old school and get updated old school
      const oldSchool = await School.findByIdAndUpdate(
        educationalSystem.school,
        { $pull: { educationalSystems: educationalSystem._id } },
        { new: true }
      ).populate('educationalSystems');

      // Add to new school and get updated new school
      const updatedNewSchool = await School.findByIdAndUpdate(
        newSchoolId,
        { $push: { educationalSystems: educationalSystem._id } },
        { new: true }
      ).populate('educationalSystems');

      console.log('Updated schools:', {
        oldSchool,
        updatedNewSchool
      });

      educationalSystem.school = newSchoolId;
    }

    // Check for duplicate name in the same school
    if (updateData.name && updateData.name !== educationalSystem.name) {
      const existingSystem = await EducationalSystem.findOne({
        name: updateData.name,
        school: educationalSystem.school,
        _id: { $ne: id }
      });
      if (existingSystem) {
        return res.status(400).json({ message: "Educational system name already exists in this school" });
      }
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (key !== 'schoolId' && key !== 'school' && key !== '_id') {
        educationalSystem[key] = updateData[key];
      }
    });

    // Save changes
    await educationalSystem.save();
    console.log('Updated educational system:', educationalSystem);

    // Get current school with populated educationalSystems
    const currentSchool = await School.findById(educationalSystem.school)
      .populate('educationalSystems');

    // Fetch updated system with populated fields
    const updatedSystem = await EducationalSystem.findById(id)
      .populate('school', 'name code type')
      .populate('curriculums', 'name');

    res.json({
      educationalSystem: updatedSystem,
      school: currentSchool
    });
  } catch (error) {
    console.error('Error in updateEducationalSystem:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete educational system
exports.deleteEducationalSystem = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting educational system:', id);

    const educationalSystem = await EducationalSystem.findById(id);
    if (!educationalSystem) {
      return res.status(404).json({ message: "Educational system not found" });
    }

    // Remove educational system from school's educationalSystems array
    await School.findByIdAndUpdate(
      educationalSystem.school,
      { $pull: { educationalSystems: educationalSystem._id } }
    );

    await educationalSystem.remove();
    console.log('Successfully deleted educational system');

    res.json({ message: "Educational system deleted successfully" });
  } catch (error) {
    console.error('Error in deleteEducationalSystem:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get educational systems by school
exports.getEducationalSystemsBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    console.log('Getting educational systems for school:', schoolId);

    const systems = await EducationalSystem.find({ school: schoolId })
      .populate('school', 'name code type')
      .populate('curriculums', 'name')
      .sort({ createdAt: -1 });

    return res.json({ data: systems });
  } catch (error) {
    console.error('Error in getEducationalSystemsBySchool:', error);
    return res.status(500).json({ message: error.message });
  }
};

// Get educational system by ID
exports.getEducationalSystemById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Getting educational system by ID:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const system = await EducationalSystem.findById(id)
      .populate('school', 'name code type')
      .populate('curriculums', 'name');

    if (!system) {
      return res.status(404).json({ message: "Educational system not found" });
    }

    return res.json({ data: system });
  } catch (error) {
    console.error('Error in getEducationalSystemById:', error);
    return res.status(500).json({ message: error.message });
  }
};