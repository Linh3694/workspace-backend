// backend/controllers/jobController.js
const Job = require("../../models/Job");

exports.createJob = async (req, res) => {
  try {
    console.log("Received Data:", req.body); // Debug dữ liệu

    if (typeof req.body.requirements !== "string") {
      return res.status(400).json({ message: "Lỗi: requirements phải là một chuỗi string" });
    }

    const newJob = new Job({
      ...req.body,
      pinnedAt: req.body.pinned ? new Date() : null,
      updatedAt: new Date(),
    });
    await newJob.save();
    
    res.status(201).json({ message: "Job created successfully", job: newJob });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ message: "Error creating job", error });
  }
};

exports.getJobs = async (req, res) => {
  try {
    const Application = require("../../models/Application");
    
    // Lấy tất cả jobs
    const jobs = await Job.find();
    
    // Đếm số CV apply cho từng job
    const jobsWithCount = await Promise.all(
      jobs.map(async (job) => {
        const cvCount = await Application.countDocuments({ appliedJob: job._id });
        return {
          ...job.toObject(),
          cvCount
        };
      })
    );
    
    res.status(200).json(jobsWithCount);
  } catch (error) {
    res.status(500).json({ message: "Error fetching jobs", error });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const existingJob = await Job.findById(id);
    if (!existingJob) {
      return res.status(404).json({ message: "Job not found" });
    }

    const update = { ...req.body, updatedAt: new Date() };
    // Cập nhật thời điểm ghim: chỉ set khi chuyển từ chưa ghim -> ghim,
    // để "ghim trước đứng trước" theo pinnedAt tăng dần
    if (req.body.pinned === true && !existingJob.pinned) {
      update.pinnedAt = new Date();
    } else if (req.body.pinned === false) {
      update.pinnedAt = null;
    }

    const updatedJob = await Job.findByIdAndUpdate(id, update, { new: true });
    res.status(200).json({ message: "Job updated successfully", job: updatedJob });
  } catch (error) {
    res.status(500).json({ message: "Error updating job", error });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedJob = await Job.findByIdAndDelete(id);
    if (!deletedJob) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.status(200).json({ message: "Job deleted successfully", job: deletedJob });
  } catch (error) {
    res.status(500).json({ message: "Error deleting job", error });
  }
};

exports.toggleJobActive = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Đảo trạng thái active
    job.active = !job.active;
    await job.save();

    res.status(200).json({ message: "Cập nhật trạng thái thành công!", job });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái job:", error);
    res.status(500).json({ message: "Lỗi server khi cập nhật trạng thái" });
  }
};

exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.status(200).json({ job });
  } catch (error) {
    res.status(500).json({ message: "Error fetching job", error });
  }
};