const Admission = require('../../models/Admission');

// Lấy dữ liệu thống kê mới nhất về tuyển sinh
exports.getLatestAdmissionStats = async (req, res) => {
    try {
        // Tìm bản ghi mới nhất dựa vào thời gian cập nhật
        const admissionStats = await Admission.findOne({ schoolYear: '2025-2026' }).sort({ lastUpdated: -1 });

        if (!admissionStats) {
            // Nếu chưa có dữ liệu, tạo bản ghi đầu tiên
            const newAdmissionStats = await Admission.create({
                schoolYear: '2025-2026',
                newStudents: 0,
                returningStudents: 0
            });

            return res.status(200).json({
                success: true,
                data: newAdmissionStats
            });
        }

        return res.status(200).json({
            success: true,
            data: admissionStats
        });
    } catch (error) {
        console.error('Error getting admission stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể lấy dữ liệu thống kê tuyển sinh',
            error: error.message
        });
    }
};

// Cập nhật số lượng học sinh mới
exports.updateNewStudents = async (req, res) => {
    try {
        const { count } = req.body;

        if (isNaN(count)) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng học sinh không hợp lệ'
            });
        }

        // Tìm bản ghi hiện tại để cập nhật
        let admissionStats = await Admission.findOne({ schoolYear: '2025-2026' });

        if (!admissionStats) {
            // Nếu chưa có, tạo mới
            admissionStats = await Admission.create({
                schoolYear: '2025-2026',
                newStudents: parseInt(count, 10),
                returningStudents: 0
            });
        } else {
            // Cập nhật bản ghi hiện có
            admissionStats.newStudents = parseInt(count, 10);
            admissionStats.lastUpdated = Date.now();
            await admissionStats.save();
        }

        return res.status(200).json({
            success: true,
            data: admissionStats,
            message: 'Cập nhật số học sinh mới thành công'
        });
    } catch (error) {
        console.error('Error updating new students:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể cập nhật số học sinh mới',
            error: error.message
        });
    }
};

// Cập nhật số lượng học sinh hiện hữu (tái ghi danh)
exports.updateReturningStudents = async (req, res) => {
    try {
        const { count } = req.body;

        if (isNaN(count)) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng học sinh không hợp lệ'
            });
        }

        // Tìm bản ghi hiện tại để cập nhật
        let admissionStats = await Admission.findOne({ schoolYear: '2025-2026' });

        if (!admissionStats) {
            // Nếu chưa có, tạo mới
            admissionStats = await Admission.create({
                schoolYear: '2025-2026',
                newStudents: 0,
                returningStudents: parseInt(count, 10)
            });
        } else {
            // Cập nhật bản ghi hiện có
            admissionStats.returningStudents = parseInt(count, 10);
            admissionStats.lastUpdated = Date.now();
            await admissionStats.save();
        }

        return res.status(200).json({
            success: true,
            data: admissionStats,
            message: 'Cập nhật số học sinh tái ghi danh thành công'
        });
    } catch (error) {
        console.error('Error updating returning students:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể cập nhật số học sinh tái ghi danh',
            error: error.message
        });
    }
};

// Tăng số lượng học sinh mới thêm 1
exports.incrementNewStudents = async (req, res) => {
    try {
        // Tìm bản ghi hiện tại để cập nhật
        let admissionStats = await Admission.findOne({ schoolYear: '2025-2026' });

        if (!admissionStats) {
            // Nếu chưa có, tạo mới
            admissionStats = await Admission.create({
                schoolYear: '2025-2026',
                newStudents: 1,
                returningStudents: 0
            });
        } else {
            // Tăng số học sinh mới lên 1
            admissionStats.newStudents += 1;
            admissionStats.lastUpdated = Date.now();
            await admissionStats.save();
        }

        return res.status(200).json({
            success: true,
            data: admissionStats,
            message: 'Tăng số học sinh mới thành công'
        });
    } catch (error) {
        console.error('Error incrementing new students:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể tăng số học sinh mới',
            error: error.message
        });
    }
};

// Tăng số lượng học sinh tái ghi danh thêm 1
exports.incrementReturningStudents = async (req, res) => {
    try {
        // Tìm bản ghi hiện tại để cập nhật
        let admissionStats = await Admission.findOne({ schoolYear: '2025-2026' });

        if (!admissionStats) {
            // Nếu chưa có, tạo mới
            admissionStats = await Admission.create({
                schoolYear: '2025-2026',
                newStudents: 0,
                returningStudents: 1
            });
        } else {
            // Tăng số học sinh tái ghi danh lên 1
            admissionStats.returningStudents += 1;
            admissionStats.lastUpdated = Date.now();
            await admissionStats.save();
        }

        return res.status(200).json({
            success: true,
            data: admissionStats,
            message: 'Tăng số học sinh tái ghi danh thành công'
        });
    } catch (error) {
        console.error('Error incrementing returning students:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể tăng số học sinh tái ghi danh',
            error: error.message
        });
    }
};

// Thiết lập lại toàn bộ dữ liệu thống kê tuyển sinh
exports.resetAdmissionStats = async (req, res) => {
    try {
        const { newStudents, returningStudents } = req.body;

        if (isNaN(newStudents) || isNaN(returningStudents)) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng học sinh không hợp lệ'
            });
        }

        // Tìm bản ghi hiện tại để cập nhật
        let admissionStats = await Admission.findOne({ schoolYear: '2025-2026' });

        if (!admissionStats) {
            // Nếu chưa có, tạo mới
            admissionStats = await Admission.create({
                schoolYear: '2025-2026',
                newStudents: parseInt(newStudents, 10),
                returningStudents: parseInt(returningStudents, 10)
            });
        } else {
            // Cập nhật toàn bộ
            admissionStats.newStudents = parseInt(newStudents, 10);
            admissionStats.returningStudents = parseInt(returningStudents, 10);
            admissionStats.lastUpdated = Date.now();
            await admissionStats.save();
        }

        return res.status(200).json({
            success: true,
            data: admissionStats,
            message: 'Thiết lập lại thống kê tuyển sinh thành công'
        });
    } catch (error) {
        console.error('Error resetting admission stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể thiết lập lại thống kê tuyển sinh',
            error: error.message
        });
    }
};
