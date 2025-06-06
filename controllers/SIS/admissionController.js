const mongoose = require("mongoose");
const Admission = require("../../models/Admission");
const Student = require("../../models/Student");
const Parent = require("../../models/Parent");

// Tạo hồ sơ ứng tuyển mới
exports.createAdmission = async (req, res) => {
    try {
        const { fullName, dateOfBirth, appliedClass, parents } = req.body;
        if (!fullName || !dateOfBirth || !appliedClass || !parents?.length) {
            return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
        }

        const newAdmission = await Admission.create({
            ...req.body,
            status: "Follow up",
            followUpType: "Cold",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return res.status(201).json(newAdmission);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Cập nhật hồ sơ ứng tuyển
exports.updateAdmission = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID không hợp lệ" });
        }

        const admission = await Admission.findById(id);
        if (!admission) {
            return res.status(404).json({ message: "Không tìm thấy hồ sơ" });
        }

        Object.assign(admission, req.body);
        admission.updatedAt = new Date();
        await admission.save();

        return res.json(admission);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Chuyển giai đoạn tiếp theo
exports.nextStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { nextStatus } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID không hợp lệ" });
        }

        const admission = await Admission.findById(id);
        if (!admission) {
            return res.status(404).json({ message: "Không tìm thấy hồ sơ" });
        }

        const stages = ["Follow up", "Test", "After test", "Offer", "Paid"];
        const currentIndex = stages.indexOf(admission.status);
        const nextIndex = stages.indexOf(nextStatus);

        if (nextIndex <= currentIndex) {
            return res.status(400).json({ message: "Chuyển giai đoạn không hợp lệ" });
        }

        // Kiểm tra điều kiện chuyển từ Test sang After test
        if (admission.status === "Test" && nextStatus === "After test") {
            const hasValidTest = admission.entranceTests?.some(test => test.testDate && test.result);
            if (!hasValidTest) {
                return res.status(400).json({ 
                    message: "Cần có ít nhất một bản ghi kiểm tra đầu vào có thời gian và kết quả trước khi chuyển giai đoạn" 
                });
            }
        }

        admission.status = nextStatus;
        admission.updatedAt = new Date();
        await admission.save();

        if (nextStatus === "Paid") {
            await enrollStudent(admission);
        }

        return res.json(admission);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Chuyển hồ sơ thành học sinh chính thức
async function enrollStudent(admission) {
    try {
        const newStudent = await Student.create({
            studentCode: `HS${Date.now()}`,
            fullName: admission.fullName,
            dateOfBirth: admission.dateOfBirth,
            gender: admission.gender,
            address: admission.parents[0]?.address || "",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const parents = await Promise.all(
            admission.parents.map(async (p) => {
                return await Parent.create({
                    fullName: p.fullName,
                    phone: p.phone,
                    email: p.email,
                    relationship: p.relationship,
                    address: p.address,
                    students: [newStudent._id],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            })
        );

        newStudent.parents = parents.map((p) => p._id);
        await newStudent.save();
    } catch (err) {
        console.error("Lỗi khi ghi danh học sinh:", err);
    }
}

// Lấy tất cả hồ sơ ứng tuyển
exports.getAllAdmissions = async (req, res) => {
    try {
        const admissions = await Admission.find().sort({ createdAt: -1 });
        return res.json({ data: admissions });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};