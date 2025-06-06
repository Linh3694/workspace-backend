const StudentClassEnrollment = require("../../models/StudentClassEnrollment");
const Class = require("../../models/Class");
const Student = require("../../models/Student");

// Create a new enrollment
exports.createEnrollment = async (req, res) => {
    try {
        const { student, class: classId, schoolYear, status } = req.body;
        if (!student || !classId || !schoolYear) {
            return res.status(400).json({ message: "student, class, and schoolYear are required" });
        }
        const oldEnrollments = await StudentClassEnrollment.find({
            student,
            schoolYear,
            status: "active"
        });

        for (const old of oldEnrollments) {
            // Xóa học sinh khỏi lớp cũ
            await Class.findByIdAndUpdate(
                old.class,
                { $pull: { students: student } }
            );
            // Xóa lớp cũ khỏi student (nếu muốn chỉ lưu lớp hiện tại)
            await Student.findByIdAndUpdate(
                student,
                { $pull: { class: old.class } }
            );
            // Có thể cập nhật status của enrollment cũ thành 'transferred' nếu muốn lưu lịch sử
            await StudentClassEnrollment.findByIdAndUpdate(
                old._id,
                { status: "transferred" }
            );
        }
        const enrollment = await StudentClassEnrollment.create({
            student,
            class: classId,
            schoolYear,
            status: status || "active",
        });
        // Cập nhật students cho Class
        await Class.findByIdAndUpdate(
            classId,
            { $addToSet: { students: student } }
        );
        // Cập nhật class cho Student
        await Student.findByIdAndUpdate(
            student,
            { $addToSet: { class: classId } }
        );
        return res.status(201).json(enrollment);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Get all enrollments
exports.getAllEnrollments = async (req, res) => {
    try {
        const enrollments = await StudentClassEnrollment.find()
            .populate("student")
            .populate("class")
            .populate("schoolYear");
        return res.json(enrollments);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Get enrollment by ID
exports.getEnrollmentById = async (req, res) => {
    try {
        const { id } = req.params;
        const enrollment = await StudentClassEnrollment.findById(id)
            .populate("student")
            .populate("class")
            .populate("schoolYear");
        if (!enrollment) {
            return res.status(404).json({ message: "Enrollment not found" });
        }
        return res.json(enrollment);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Update enrollment
exports.updateEnrollment = async (req, res) => {
    try {
        const { id } = req.params;
        const update = req.body;
        const enrollment = await StudentClassEnrollment.findByIdAndUpdate(id, update, { new: true })
            .populate("student")
            .populate("class")
            .populate("schoolYear");
        if (!enrollment) {
            return res.status(404).json({ message: "Enrollment not found" });
        }
        return res.json(enrollment);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Delete enrollment
exports.deleteEnrollment = async (req, res) => {
    try {
        const { id } = req.params;
        const enrollment = await StudentClassEnrollment.findByIdAndDelete(id);
        if (!enrollment) {
            return res.status(404).json({ message: "Enrollment not found" });
        }
        return res.json({ message: "Enrollment deleted successfully" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Get enrollments by class
exports.getEnrollmentsByClass = async (req, res) => {
    try {
        const { classId } = req.params;
        const enrollments = await StudentClassEnrollment.find({ class: classId })
            .populate("student")
            .populate("class")
            .populate("schoolYear");
        return res.json(enrollments);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Get enrollments by student
exports.getEnrollmentsByStudent = async (req, res) => {
    try {
        const { studentId } = req.params;
        const enrollments = await StudentClassEnrollment.find({ student: studentId })
            .populate("student")
            .populate("class")
            .populate("schoolYear");
        return res.json(enrollments);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};