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

// Bulk import enrollments from Excel
exports.bulkImportEnrollments = async (req, res) => {
    try {
        const { enrollments, schoolYear } = req.body;
        
        if (!enrollments || !Array.isArray(enrollments) || !schoolYear) {
            return res.status(400).json({ 
                message: "enrollments array and schoolYear are required" 
            });
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < enrollments.length; i++) {
            const enrollment = enrollments[i];
            const rowNum = i + 2; // Excel row number (starting from 2)

            try {
                // Validate required fields
                if (!enrollment.StudentCode || !enrollment.ClassName) {
                    errors.push(`Dòng ${rowNum}: Thiếu StudentCode hoặc ClassName`);
                    continue;
                }

                // Find student by code
                const student = await Student.findOne({ studentCode: enrollment.StudentCode });
                if (!student) {
                    errors.push(`Dòng ${rowNum}: Không tìm thấy học sinh ${enrollment.StudentCode}`);
                    continue;
                }

                // Find class by name and school year
                const classDoc = await Class.findOne({ 
                    className: enrollment.ClassName,
                    schoolYear: schoolYear
                });
                if (!classDoc) {
                    errors.push(`Dòng ${rowNum}: Không tìm thấy lớp ${enrollment.ClassName}`);
                    continue;
                }

                // Check for existing enrollment
                const existingEnrollment = await StudentClassEnrollment.findOne({
                    student: student._id,
                    schoolYear: schoolYear,
                    status: "active"
                });

                if (existingEnrollment) {
                    // Update existing enrollment if class is different
                    if (existingEnrollment.class.toString() !== classDoc._id.toString()) {
                        // Remove from old class
                        await Class.findByIdAndUpdate(
                            existingEnrollment.class,
                            { $pull: { students: student._id } }
                        );

                        // Update enrollment
                        await StudentClassEnrollment.findByIdAndUpdate(
                            existingEnrollment._id,
                            { class: classDoc._id }
                        );

                        // Add to new class
                        await Class.findByIdAndUpdate(
                            classDoc._id,
                            { $addToSet: { students: student._id } }
                        );

                        results.push(`Dòng ${rowNum}: Chuyển ${enrollment.StudentCode} từ lớp cũ sang ${enrollment.ClassName}`);
                    } else {
                        results.push(`Dòng ${rowNum}: ${enrollment.StudentCode} đã có trong lớp ${enrollment.ClassName}`);
                    }
                } else {
                    // Create new enrollment
                    await StudentClassEnrollment.create({
                        student: student._id,
                        class: classDoc._id,
                        schoolYear: schoolYear,
                        status: "active"
                    });

                    // Add student to class
                    await Class.findByIdAndUpdate(
                        classDoc._id,
                        { $addToSet: { students: student._id } }
                    );

                    // Update student's class
                    await Student.findByIdAndUpdate(
                        student._id,
                        { $addToSet: { class: classDoc._id } }
                    );

                    results.push(`Dòng ${rowNum}: Thêm ${enrollment.StudentCode} vào lớp ${enrollment.ClassName}`);
                }

            } catch (error) {
                errors.push(`Dòng ${rowNum}: Lỗi xử lý - ${error.message}`);
            }
        }

        return res.status(200).json({
            message: "Bulk import completed",
            results: results,
            errors: errors,
            summary: {
                total: enrollments.length,
                success: results.length,
                failed: errors.length
            }
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};