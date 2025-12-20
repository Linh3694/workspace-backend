const Application = require("../../models/Application");
const fs = require("fs");
const path = require("path");

exports.submitApplication = async (req, res) => {
  console.log("=== REQUEST FILES ===");
  console.log(req.files);
  console.log("=== REQUEST BODY ===");
  console.log(req.body);
  try {
    let graduationSchools = [];
    if (req.body.graduationSchools) {
      try {
        graduationSchools = JSON.parse(req.body.graduationSchools);
        console.log("=== PARSED GRADUATION SCHOOLS ===");
        console.log(graduationSchools);
      } catch (e) {
        console.log("=== ERROR PARSING GRADUATION SCHOOLS ===");
        console.log(e);
        return res.status(400).json({ message: "graduationSchools không hợp lệ" });
      }
    }
    const { fullname, birthdate, phone, email, highestDegree, workExperience, englishLevel, expectedSalary, appliedJob } = req.body;
    console.log("=== DESTRUCTURED BODY ===");
    console.log({ fullname, birthdate, phone, email, highestDegree, workExperience, englishLevel, expectedSalary, appliedJob });
    
    const cvFile = req.files && req.files.cvFile ? `/uploads/CV/${req.files.cvFile[0].filename}` : null;
    const profilePicture = req.files && req.files.profilePicture ? `/uploads/Profile/${req.files.profilePicture[0].filename}` : null;
    
    console.log("=== FILE PATHS ===");
    console.log({ cvFile, profilePicture });

    if (!cvFile) {
      console.log("=== CV FILE MISSING ===");
      return res.status(400).json({ message: "CV file is required" });
    }

    const newApplication = new Application({
      fullname,
      birthdate,
      phone,
      email,
      graduationSchools,
      highestDegree,
      englishLevel,
      expectedSalary,
      cvFile,
      profilePicture,
      appliedJob,
    });

    console.log("=== NEW APPLICATION OBJECT ===");
    console.log(newApplication);

    await newApplication.save();
    console.log("=== SAVED APPLICATION ===");
    console.log(newApplication);
    res.status(201).json({ message: "Application submitted successfully", application: newApplication });
  } catch (error) {
    console.log("=== ERROR IN SUBMIT APPLICATION ===");
    console.log(error);
    res.status(500).json({ message: "Error submitting application", error });
  }
};

exports.submitOpenPositionApplication = async (req, res) => {
  console.log("=== OPEN POSITION APPLICATION REQUEST ===");
  console.log("FILES:", req.files);
  console.log("BODY:", req.body);
  
  try {
    let graduationSchools = [];
    if (req.body.graduationSchools) {
      try {
        graduationSchools = JSON.parse(req.body.graduationSchools);
      } catch (e) {
        return res.status(400).json({ message: "graduationSchools không hợp lệ" });
      }
    }

    const { 
      fullname, 
      birthdate, 
      phone, 
      email, 
      highestDegree, 
      englishLevel, 
      expectedSalary,
      openPositionTitle,
      openPositionType
    } = req.body;
    
    const cvFile = req.files && req.files.cvFile ? `/uploads/CV/${req.files.cvFile[0].filename}` : null;
    const profilePicture = req.files && req.files.profilePicture ? `/uploads/Profile/${req.files.profilePicture[0].filename}` : null;

    if (!cvFile) {
      return res.status(400).json({ message: "CV file is required" });
    }

    if (!openPositionTitle) {
      return res.status(400).json({ message: "Tên vị trí ứng tuyển là bắt buộc" });
    }

    const newApplication = new Application({
      fullname,
      birthdate,
      phone,
      email,
      graduationSchools,
      highestDegree,
      englishLevel,
      expectedSalary,
      cvFile,
      profilePicture,
      openPositionTitle,
      openPositionType,
    });

    await newApplication.save();
    res.status(201).json({ 
      message: "Ứng tuyển vị trí mở thành công!", 
      application: newApplication 
    });
  } catch (error) {
    console.log("=== ERROR IN SUBMIT OPEN POSITION APPLICATION ===");
    console.log(error);
    res.status(500).json({ message: "Error submitting open position application", error });
  }
};

exports.getApplications = async (req, res) => {
  try {
    const applications = await Application.find().populate("appliedJob");
    res.status(200).json(applications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching applications", error });
  }
};

exports.getApplicationsByJob = async (req, res) => {
  try {
    const applications = await Application.find({ appliedJob: req.params.jobId });
    res.status(200).json({ applications });
  } catch (error) {
    res.status(500).json({ message: "Error fetching applications", error });
  }
};

exports.getOpenPositionApplications = async (req, res) => {
  try {
    const applications = await Application.find({ 
      openPositionTitle: { $exists: true, $ne: null },
      appliedJob: { $exists: false }
    });
    res.status(200).json({ applications });
  } catch (error) {
    res.status(500).json({ message: "Error fetching open position applications", error });
  }
};

// Xóa ứng viên
exports.deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Tìm application để lấy thông tin file
    const application = await Application.findById(id);
    
    if (!application) {
      return res.status(404).json({ message: "Không tìm thấy ứng viên" });
    }

    // Xóa file CV nếu có
    if (application.cvFile) {
      const cvPath = path.join(__dirname, "../../", application.cvFile);
      if (fs.existsSync(cvPath)) {
        fs.unlinkSync(cvPath);
        console.log(`Đã xóa file CV: ${cvPath}`);
      }
    }

    // Xóa ảnh đại diện nếu có
    if (application.profilePicture) {
      const profilePath = path.join(__dirname, "../../", application.profilePicture);
      if (fs.existsSync(profilePath)) {
        fs.unlinkSync(profilePath);
        console.log(`Đã xóa ảnh đại diện: ${profilePath}`);
      }
    }

    // Xóa application khỏi database
    await Application.findByIdAndDelete(id);

    res.status(200).json({ message: "Đã xóa ứng viên thành công" });
  } catch (error) {
    console.log("=== ERROR IN DELETE APPLICATION ===");
    console.log(error);
    res.status(500).json({ message: "Lỗi khi xóa ứng viên", error });
  }
};