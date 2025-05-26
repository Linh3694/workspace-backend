const TimeAttendance = require("../models/TimeAttendance");
const Users = require("../models/Users");

// Upload batch dữ liệu chấm công từ máy chấm công HIKVISION
exports.uploadAttendanceBatch = async (req, res) => {
    try {
        const { data, tracker_id } = req.body;

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({
                status: "error",
                message: "Dữ liệu không hợp lệ. Cần array data."
            });
        }

        let recordsProcessed = 0;
        let recordsUpdated = 0;
        let errors = [];

        for (const record of data) {
            try {
                const { fingerprintCode, dateTime, device_id } = record;

                if (!fingerprintCode || !dateTime) {
                    errors.push({ record, error: "fingerprintCode và dateTime là bắt buộc" });
                    continue;
                }

                // Parse datetime
                const timestamp = new Date(dateTime);
                if (isNaN(timestamp.getTime())) {
                    errors.push({ record, error: "Format datetime không hợp lệ" });
                    continue;
                }

                // Tìm hoặc tạo record cho ngày này
                const attendanceRecord = await TimeAttendance.findOrCreateDayRecord(
                    fingerprintCode,
                    timestamp,
                    device_id
                );

                // Update tracker_id nếu có
                if (tracker_id) {
                    attendanceRecord.trackerId = tracker_id;
                }

                // Cập nhật thời gian chấm công
                attendanceRecord.updateAttendanceTime(timestamp, device_id);

                // Lưu record
                await attendanceRecord.save();

                if (attendanceRecord.isNew === false) {
                    recordsUpdated++;
                } else {
                    recordsProcessed++;
                }

            } catch (error) {
                console.error(`Lỗi xử lý record:`, error);
                errors.push({ record, error: error.message });
            }
        }

        res.status(200).json({
            status: "success",
            message: `Đã xử lý ${recordsProcessed} record mới, cập nhật ${recordsUpdated} record`,
            recordsProcessed,
            recordsUpdated,
            totalErrors: errors.length,
            errors: errors.slice(0, 10) // Chỉ trả về 10 lỗi đầu tiên
        });

    } catch (error) {
        console.error("Lỗi upload attendance batch:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi xử lý dữ liệu chấm công",
            error: error.message
        });
    }
};

// Lấy dữ liệu chấm công theo filter
exports.getAttendanceRecords = async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            employeeCode,
            page = 1,
            limit = 100,
            sortBy = "date",
            sortOrder = "desc"
        } = req.query;

        // Build filter
        const filter = {};

        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (startDate) {
            filter.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            filter.date = { $lte: new Date(endDate) };
        }

        if (employeeCode) {
            filter.employeeCode = employeeCode;
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        // Query
        const [records, totalCount] = await Promise.all([
            TimeAttendance.find(filter)
                .populate('user', 'fullname email employeeCode')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            TimeAttendance.countDocuments(filter)
        ]);

        res.status(200).json({
            status: "success",
            data: {
                records,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCount / parseInt(limit)),
                    totalRecords: totalCount,
                    hasMore: skip + records.length < totalCount
                }
            }
        });

    } catch (error) {
        console.error("Lỗi lấy attendance records:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi lấy dữ liệu chấm công",
            error: error.message
        });
    }
};

// Lấy thống kê attendance
exports.getAttendanceStats = async (req, res) => {
    try {
        const { startDate, endDate, employeeCode } = req.query;

        // Thống kê tổng quan
        const totalRecords = await TimeAttendance.countDocuments();
        const totalEmployees = await TimeAttendance.distinct('employeeCode').then(codes => codes.length);

        // Thống kê hôm nay
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRecords = await TimeAttendance.countDocuments({ date: today });

        // Thống kê theo filter
        const stats = await TimeAttendance.getAttendanceStats(startDate, endDate, employeeCode);

        // Record mới nhất
        const latestRecord = await TimeAttendance.findOne()
            .sort({ updatedAt: -1 })
            .populate('user', 'fullname employeeCode')
            .lean();

        res.status(200).json({
            status: "success",
            data: {
                overview: {
                    totalRecords,
                    totalEmployees,
                    todayRecords,
                    latestRecord
                },
                employeeStats: stats
            }
        });

    } catch (error) {
        console.error("Lỗi lấy attendance stats:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi lấy thống kê chấm công",
            error: error.message
        });
    }
};

// Lấy chi tiết chấm công của một nhân viên
exports.getEmployeeAttendance = async (req, res) => {
    try {
        const { employeeCode } = req.params;
        const { startDate, endDate, date, includeRawData = false } = req.query;

        // Build filter
        const filter = { employeeCode };

        // Xử lý query theo ngày cụ thể (date) hoặc khoảng thời gian (startDate/endDate)
        if (date) {
            // Query theo ngày cụ thể (YYYY-MM-DD)
            const queryDate = new Date(date);
            queryDate.setHours(0, 0, 0, 0); // Set về đầu ngày UTC
            
            const nextDay = new Date(queryDate);
            nextDay.setDate(nextDay.getDate() + 1); // Ngày tiếp theo
            
            filter.date = {
                $gte: queryDate,
                $lt: nextDay
            };
            
            console.log(`Querying attendance for date: ${date}, filter:`, filter.date);
        } else if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Select fields
        let selectFields = '-rawData'; // Mặc định không lấy rawData
        if (includeRawData === 'true') {
            selectFields = '';
        }

        const records = await TimeAttendance.find(filter)
            .select(selectFields)
            .populate('user', 'fullname email employeeCode')
            .sort({ date: -1 })
            .lean();

        // Tính toán thống kê
        const stats = {
            totalDays: records.length,
            totalCheckIns: records.reduce((sum, record) => sum + record.totalCheckIns, 0),
            avgCheckInsPerDay: records.length > 0 ?
                records.reduce((sum, record) => sum + record.totalCheckIns, 0) / records.length : 0,
            daysWithSingleCheckIn: records.filter(record => record.totalCheckIns === 1).length,
            daysWithMultipleCheckIns: records.filter(record => record.totalCheckIns > 1).length
        };

        res.status(200).json({
            status: "success",
            data: {
                employeeCode,
                records,
                stats
            }
        });

    } catch (error) {
        console.error("Lỗi lấy employee attendance:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi lấy dữ liệu chấm công nhân viên",
            error: error.message
        });
    }
};

// Cập nhật ghi chú cho record chấm công
exports.updateAttendanceNotes = async (req, res) => {
    try {
        const { recordId } = req.params;
        const { notes, status } = req.body;

        const record = await TimeAttendance.findById(recordId);

        if (!record) {
            return res.status(404).json({
                status: "error",
                message: "Không tìm thấy record chấm công"
            });
        }

        if (notes !== undefined) {
            record.notes = notes;
        }

        if (status && ["active", "processed", "error"].includes(status)) {
            record.status = status;
        }

        await record.save();

        res.status(200).json({
            status: "success",
            message: "Đã cập nhật thành công",
            data: record
        });

    } catch (error) {
        console.error("Lỗi cập nhật attendance notes:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi cập nhật ghi chú",
            error: error.message
        });
    }
};

// Xóa dữ liệu chấm công theo điều kiện
exports.deleteAttendanceRecords = async (req, res) => {
    try {
        const { startDate, endDate, employeeCode, confirmDelete } = req.body;

        if (!confirmDelete) {
            return res.status(400).json({
                status: "error",
                message: "Cần xác nhận xóa dữ liệu bằng confirmDelete: true"
            });
        }

        // Build filter
        const filter = {};

        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (employeeCode) {
            filter.employeeCode = employeeCode;
        }

        if (Object.keys(filter).length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Cần ít nhất một điều kiện để xóa (startDate/endDate hoặc employeeCode)"
            });
        }

        const result = await TimeAttendance.deleteMany(filter);

        res.status(200).json({
            status: "success",
            message: `Đã xóa ${result.deletedCount} record chấm công`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error("Lỗi xóa attendance records:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi xóa dữ liệu chấm công",
            error: error.message
        });
    }
};

// Đồng bộ employee code với Users
exports.syncWithUsers = async (req, res) => {
    try {
        // Lấy tất cả attendance records chưa có user reference
        const attendanceRecords = await TimeAttendance.find({ user: null });

        let syncedCount = 0;
        const errors = [];

        for (const record of attendanceRecords) {
            try {
                // Tìm user theo employeeCode
                const user = await Users.findOne({ employeeCode: record.employeeCode });

                if (user) {
                    record.user = user._id;
                    await record.save();
                    syncedCount++;
                }
            } catch (error) {
                errors.push({
                    employeeCode: record.employeeCode,
                    error: error.message
                });
            }
        }

        res.status(200).json({
            status: "success",
            message: `Đã đồng bộ ${syncedCount} record với Users`,
            syncedCount,
            totalProcessed: attendanceRecords.length,
            errors
        });

    } catch (error) {
        console.error("Lỗi sync with users:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi đồng bộ với Users",
            error: error.message
        });
    }
}; 