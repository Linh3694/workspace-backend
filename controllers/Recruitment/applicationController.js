const Application = require("../../models/Application");

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