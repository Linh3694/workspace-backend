const asyncHandler = require('express-async-handler');
const Report = require('../../models/Report');
const Grade = require('../../models/Grade');
const Subject = require('../../models/Subject');

// Lấy danh sách tất cả các báo cáo
exports.getReports = asyncHandler(async (req, res) => {
    const reports = await Report.find()
        .populate('student', 'name studentCode')
        .populate('class', 'className')
        .populate('schoolYear', 'code');
    res.json(reports);
});

// Lấy báo cáo theo ID
exports.getReportById = asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.id)
        .populate('student', 'name studentCode')
        .populate('class', 'className')
        .populate('schoolYear', 'code');

    if (!report) {
        return res.status(404).json({ message: 'Không tìm thấy báo cáo' });
    }

    res.json(report);
});

// Tạo báo cáo mới
exports.createReport = asyncHandler(async (req, res) => {
    const report = new Report(req.body);
    const newReport = await report.save();

    const populatedReport = await Report.findById(newReport._id)
        .populate('student', 'name studentCode')
        .populate('class', 'className')
        .populate('schoolYear', 'code');

    res.status(201).json(populatedReport);
});

// Cập nhật báo cáo
exports.updateReport = asyncHandler(async (req, res) => {
    const report = await Report.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
    )
        .populate('student', 'name studentCode')
        .populate('class', 'className')
        .populate('schoolYear', 'code');

    if (!report) {
        return res.status(404).json({ message: 'Không tìm thấy báo cáo' });
    }

    res.json(report);
});

// Xóa báo cáo
exports.deleteReport = asyncHandler(async (req, res) => {
    const report = await Report.findByIdAndDelete(req.params.id);

    if (!report) {
        return res.status(404).json({ message: 'Không tìm thấy báo cáo' });
    }

    res.json({ message: 'Đã xóa báo cáo thành công' });
});

// Lấy bảng điểm học sinh
exports.getStudentReport = asyncHandler(async (req, res) => {
    const { student, class: classId, schoolYear, semester, type } = req.query;

    // Kiểm tra các tham số bắt buộc
    if (!student || !classId || !schoolYear || !semester || !type) {
        return res.status(400).json({
            message: 'Thiếu tham số. Cần cung cấp học sinh, lớp, năm học, học kỳ và loại báo cáo.'
        });
    }

    // Tìm báo cáo có sẵn
    let report = await Report.findOne({
        student,
        class: classId,
        schoolYear,
        type,
        'data.semester': semester
    })
        .populate('student', 'name studentCode')
        .populate('class', 'className')
        .populate('schoolYear', 'code');

    // Nếu đã có báo cáo, trả về báo cáo đó
    if (report) {
        return res.json(report);
    }

    // Nếu chưa có báo cáo, lấy tất cả điểm của học sinh theo lớp, năm học và học kỳ
    const grades = await Grade.find({
        student,
        class: classId,
        schoolYear,
        semester
    }).populate('subject', 'name code');

    // Nhóm điểm theo môn học
    const subjectGrades = {};

    grades.forEach(grade => {
        const subjectId = grade.subject._id.toString();

        if (!subjectGrades[subjectId]) {
            subjectGrades[subjectId] = {
                subject: grade.subject,
                grades: {
                    quiz: [],
                    midterm: [],
                    final: [],
                    assignment: [],
                    average: 0
                }
            };
        }

        // Thêm điểm vào loại tương ứng
        subjectGrades[subjectId].grades[grade.type].push(grade.score);
    });

    // Tính điểm trung bình cho mỗi môn học
    let totalAverage = 0;
    let subjectCount = 0;

    const subjectsData = Object.values(subjectGrades).map(subjectData => {
        // Trọng số ví dụ (có thể điều chỉnh):
        // 20% cho điểm kiểm tra
        // 30% cho điểm giữa kỳ
        // 40% cho điểm cuối kỳ
        // 10% cho điểm bài tập

        const quizAvg = subjectData.grades.quiz.length > 0
            ? subjectData.grades.quiz.reduce((sum, score) => sum + score, 0) / subjectData.grades.quiz.length
            : 0;

        const midtermAvg = subjectData.grades.midterm.length > 0
            ? subjectData.grades.midterm.reduce((sum, score) => sum + score, 0) / subjectData.grades.midterm.length
            : 0;

        const finalAvg = subjectData.grades.final.length > 0
            ? subjectData.grades.final.reduce((sum, score) => sum + score, 0) / subjectData.grades.final.length
            : 0;

        const assignmentAvg = subjectData.grades.assignment.length > 0
            ? subjectData.grades.assignment.reduce((sum, score) => sum + score, 0) / subjectData.grades.assignment.length
            : 0;

        // Tính điểm trung bình (có thể điều chỉnh công thức)
        const average = (
            quizAvg * 0.2 +
            midtermAvg * 0.3 +
            finalAvg * 0.4 +
            assignmentAvg * 0.1
        );

        subjectData.grades.average = average;
        totalAverage += average;
        subjectCount++;

        return subjectData;
    });

    // Tính điểm trung bình tổng thể
    const gpa = subjectCount > 0 ? totalAverage / subjectCount : 0;

    // Tạo báo cáo mới
    const newReport = new Report({
        student,
        class: classId,
        schoolYear,
        type,
        data: {
            semester,
            subjects: subjectsData,
            gpa
        }
    });

    // Lưu báo cáo
    const savedReport = await newReport.save();

    // Trả về báo cáo đã populate
    const populatedReport = await Report.findById(savedReport._id)
        .populate('student', 'name studentCode')
        .populate('class', 'className')
        .populate('schoolYear', 'code');

    res.json(populatedReport);
}); 