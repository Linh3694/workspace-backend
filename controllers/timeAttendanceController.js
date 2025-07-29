const TimeAttendance = require("../models/TimeAttendance");
const Users = require("../models/Users");

// Timestamp khi server start - chỉ nhận events sau thời điểm này
const SERVER_START_TIME = new Date();
console.log(`🚀 Server started at: ${SERVER_START_TIME.toISOString()}`);
console.log(`📅 Only processing events newer than: ${SERVER_START_TIME.toISOString()}`);

// Cấu hình: ignore events cũ hơn X phút (tính từ lúc nhận)
const IGNORE_EVENTS_OLDER_THAN_MINUTES = 1440; // 24 giờ = 1440 phút (thay vì 5 phút)

// Helper function để kiểm tra event có quá cũ không
const isEventTooOld = (eventTimestamp) => {
    if (!eventTimestamp) return false;
    
    try {
        const eventTime = new Date(eventTimestamp);
        const now = new Date();
        
        // Sử dụng global variables nếu có, fallback về constants
        const serverStartTime = global.SERVER_START_TIME || SERVER_START_TIME;
        const ignoreMinutes = global.IGNORE_EVENTS_OLDER_THAN_MINUTES || IGNORE_EVENTS_OLDER_THAN_MINUTES;
        
        // Kiểm tra event có trước khi server start không
        if (eventTime < serverStartTime) {
            console.log(`⏰ Event from ${eventTime.toISOString()} is before server start time (${serverStartTime.toISOString()}), skipping`);
            return true;
        }
        
        // Kiểm tra event có quá cũ không (hơn X phút)
        const diffInMinutes = (now - eventTime) / (1000 * 60);
        if (diffInMinutes > ignoreMinutes) {
            console.log(`⏰ Event from ${eventTime.toISOString()} is ${diffInMinutes.toFixed(1)} minutes old (limit: ${ignoreMinutes}min), skipping`);
            return true;
        }
        
        console.log(`✅ Event from ${eventTime.toISOString()} is fresh (${diffInMinutes.toFixed(1)} minutes old, limit: ${ignoreMinutes}min)`);
        return false;
        
    } catch (error) {
        console.log(`❌ Invalid timestamp format: ${eventTimestamp}`);
        return false; // Nếu không parse được timestamp, vẫn xử lý
    }
};

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

                // Parse datetime với timezone handling thống nhất
                let timestamp;
                try {
                    timestamp = TimeAttendance.parseAttendanceTimestamp(dateTime);
                } catch (parseError) {
                    errors.push({ record, error: `Format datetime không hợp lệ: ${parseError.message}` });
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

// Xử lý real-time event notification từ máy face ID Hikvision
exports.handleHikvisionEvent = async (req, res) => {
    try {
        // Enhanced debugging
        console.log(`[${new Date().toISOString()}] === HIKVISION EVENT DEBUG ===`);
        console.log('Method:', req.method);
        console.log('URL:', req.url);
        console.log('Headers:', JSON.stringify(req.headers, null, 2));
        console.log('Content-Type:', req.get('Content-Type'));
        console.log('Content-Length:', req.get('Content-Length'));
        console.log('Body type:', typeof req.body);
        console.log('Body content:', JSON.stringify(req.body, null, 2));
        console.log('Raw body keys:', Object.keys(req.body || {}));
        console.log('Query params:', JSON.stringify(req.query, null, 2));
        console.log('='.repeat(50));
        
        const eventData = req.body;
        
        // Nếu body rỗng, có thể là heartbeat/keepalive từ máy
        if (!eventData || Object.keys(eventData).length === 0) {
            console.log('📡 Received heartbeat/keepalive from Hikvision device');
            return res.status(200).json({
                status: "success",
                message: "Heartbeat received",
                timestamp: new Date().toISOString()
            });
        }
        
        // Kiểm tra định dạng event cơ bản
        if (!eventData.eventType && !eventData.EventNotificationAlert) {
            console.log('⚠️  Unknown event format, treating as heartbeat');
            return res.status(200).json({
                status: "success",
                message: "Event received but no valid eventType found",
                eventData: eventData,
                timestamp: new Date().toISOString()
            });
        }

        // Extract thông tin từ event notification
        let eventType, eventState, dateTime, activePost;
        
        if (eventData.EventNotificationAlert) {
            // Format mới của Hikvision
            const alert = eventData.EventNotificationAlert;
            eventType = alert.eventType;
            eventState = alert.eventState;
            dateTime = alert.dateTime;
            activePost = alert.ActivePost;
        } else {
            // Format cũ hoặc custom format
            eventType = eventData.eventType;
            eventState = eventData.eventState;
            dateTime = eventData.dateTime;
            activePost = eventData.ActivePost || eventData.activePost;
        }

        // Chỉ xử lý face recognition events
        const validEventTypes = ['faceSnapMatch', 'faceMatch', 'faceRecognition', 'accessControllerEvent', 'AccessControllerEvent'];
        if (!validEventTypes.includes(eventType)) {
            console.log(`Bỏ qua event type không liên quan: ${eventType}`);
            return res.status(200).json({
                status: "success",
                message: `Event type '${eventType}' không được xử lý cho chấm công`,
                eventType
            });
        }

        // Chỉ xử lý active events
        if (eventState !== 'active') {
            console.log(`Bỏ qua event state: ${eventState}`);
            return res.status(200).json({
                status: "success",
                message: `Event state '${eventState}' không được xử lý`,
                eventState
            });
        }

        // Bỏ qua event nếu quá cũ
        if (isEventTooOld(dateTime)) {
            return res.status(200).json({
                status: "success",
                message: "Event too old, skipping.",
                eventType,
                eventState,
                timestamp: new Date().toISOString()
            });
        }

        let recordsProcessed = 0;
        let recordsSkipped = 0;
        let errors = [];

        // Xử lý ActivePost array (có thể có nhiều entries)
        if (activePost && Array.isArray(activePost)) {
            for (const post of activePost) {
                try {
                    // Trích xuất thông tin nhân viên
                    const employeeCode = post.FPID || post.cardNo || post.employeeCode || post.userID;
                    const timestamp = post.dateTime || dateTime;
                    const deviceId = post.ipAddress || eventData.ipAddress || post.deviceID;

                    // Kiểm tra timestamp của post individual
                    if (isEventTooOld(timestamp)) {
                        console.log(`⏰ Skipping old post for employee ${employeeCode} at ${timestamp}`);
                        recordsSkipped++;
                        continue; // Skip post này, tiếp tục với post tiếp theo
                    }

                    if (!employeeCode) {
                        errors.push({
                            post,
                            error: "Không tìm thấy mã nhân viên (FPID, cardNo, employeeCode, userID)"
                        });
                        continue;
                    }

                    if (!timestamp) {
                        errors.push({
                            post,
                            error: "Không tìm thấy timestamp"
                        });
                        continue;
                    }

                    // Parse timestamp
                    let parsedTimestamp;
                    try {
                        parsedTimestamp = TimeAttendance.parseAttendanceTimestamp(timestamp);
                    } catch (parseError) {
                        errors.push({
                            post,
                            error: `Format datetime không hợp lệ: ${parseError.message}`
                        });
                        continue;
                    }

                    // Tìm hoặc tạo attendance record
                    const attendanceRecord = await TimeAttendance.findOrCreateDayRecord(
                        employeeCode,
                        parsedTimestamp,
                        deviceId
                    );

                    // Thêm metadata từ Hikvision event
                    attendanceRecord.notes = attendanceRecord.notes || '';
                    if (post.name) {
                        attendanceRecord.notes += `Face ID: ${post.name}; `;
                    }
                    if (post.similarity) {
                        attendanceRecord.notes += `Similarity: ${post.similarity}%; `;
                    }
                    if (eventType) {
                        attendanceRecord.notes += `Event: ${eventType}; `;
                    }

                    // Cập nhật thời gian chấm công
                    attendanceRecord.updateAttendanceTime(parsedTimestamp, deviceId);

                    // Lưu record
                    await attendanceRecord.save();
                    recordsProcessed++;

                    console.log(`✅ Đã xử lý event cho nhân viên ${employeeCode} lúc ${parsedTimestamp.toISOString()}`);

                } catch (error) {
                    console.error(`❌ Lỗi xử lý ActivePost:`, error);
                    errors.push({
                        post,
                        error: error.message
                    });
                }
            }
        } else if (activePost && !Array.isArray(activePost)) {
            // Trường hợp ActivePost là object đơn
            try {
                const employeeCode = activePost.FPID || activePost.cardNo || activePost.employeeCode || activePost.userID;
                const timestamp = activePost.dateTime || dateTime;
                const deviceId = activePost.ipAddress || eventData.ipAddress || activePost.deviceID;

                // Kiểm tra timestamp của single post
                if (isEventTooOld(timestamp)) {
                    console.log(`⏰ Skipping old single post for employee ${employeeCode} at ${timestamp}`);
                    recordsSkipped++;
                } else if (employeeCode && timestamp) {
                    const parsedTimestamp = TimeAttendance.parseAttendanceTimestamp(timestamp);
                    const attendanceRecord = await TimeAttendance.findOrCreateDayRecord(
                        employeeCode,
                        parsedTimestamp,
                        deviceId
                    );

                    // Thêm metadata
                    attendanceRecord.notes = attendanceRecord.notes || '';
                    if (activePost.name) {
                        attendanceRecord.notes += `Face ID: ${activePost.name}; `;
                    }
                    if (activePost.similarity) {
                        attendanceRecord.notes += `Similarity: ${activePost.similarity}%; `;
                    }
                    if (eventType) {
                        attendanceRecord.notes += `Event: ${eventType}; `;
                    }

                    attendanceRecord.updateAttendanceTime(parsedTimestamp, deviceId);
                    await attendanceRecord.save();
                    recordsProcessed++;

                    console.log(`✅ Đã xử lý event cho nhân viên ${employeeCode} lúc ${parsedTimestamp.toISOString()}`);
                } else {
                    errors.push({
                        activePost,
                        error: "Thiếu employeeCode hoặc timestamp"
                    });
                }
            } catch (error) {
                console.error(`❌ Lỗi xử lý single ActivePost:`, error);
                errors.push({
                    activePost,
                    error: error.message
                });
            }
        } else {
            // Không có ActivePost, thử parse từ root level
            try {
                const employeeCode = eventData.FPID || eventData.cardNo || eventData.employeeCode || eventData.userID;
                const timestamp = dateTime;
                const deviceId = eventData.ipAddress || eventData.deviceID;

                // Kiểm tra timestamp của root level event
                if (isEventTooOld(timestamp)) {
                    console.log(`⏰ Skipping old root level event for employee ${employeeCode} at ${timestamp}`);
                    recordsSkipped++;
                } else if (employeeCode && timestamp) {
                    const parsedTimestamp = TimeAttendance.parseAttendanceTimestamp(timestamp);
                    const attendanceRecord = await TimeAttendance.findOrCreateDayRecord(
                        employeeCode,
                        parsedTimestamp,
                        deviceId
                    );

                    attendanceRecord.notes = attendanceRecord.notes || '';
                    if (eventData.name) {
                        attendanceRecord.notes += `Face ID: ${eventData.name}; `;
                    }
                    if (eventType) {
                        attendanceRecord.notes += `Event: ${eventType}; `;
                    }

                    attendanceRecord.updateAttendanceTime(parsedTimestamp, deviceId);
                    await attendanceRecord.save();
                    recordsProcessed++;

                    console.log(`✅ Đã xử lý event cho nhân viên ${employeeCode} lúc ${parsedTimestamp.toISOString()}`);
                } else {
                    errors.push({
                        eventData,
                        error: "Không tìm thấy employeeCode hoặc timestamp ở root level"
                    });
                }
            } catch (error) {
                console.error(`❌ Lỗi xử lý root level event:`, error);
                errors.push({
                    eventData,
                    error: error.message
                });
            }
        }

        // Trả về response
        const response = {
            status: "success",
            message: `Đã xử lý ${recordsProcessed} event chấm công từ Hikvision`,
            timestamp: new Date().toISOString(),
            eventType,
            eventState,
            recordsProcessed,
            totalErrors: errors.length,
            recordsSkipped: recordsSkipped
        };

        if (errors.length > 0) {
            response.errors = errors.slice(0, 5); // Chỉ trả về 5 lỗi đầu tiên
        }

        console.log(`📊 Kết quả xử lý Hikvision event: ${recordsProcessed} thành công, ${errors.length} lỗi, ${recordsSkipped} bị bỏ qua`);

        res.status(200).json(response);

    } catch (error) {
        console.error("❌ Lỗi xử lý Hikvision event:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi xử lý event từ Hikvision",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// Test endpoint để simulate Hikvision event (chỉ dùng cho development)
exports.testHikvisionEvent = async (req, res) => {
    try {
        // Sample Hikvision event data để test
        const sampleEvent = {
            ipAddress: "192.168.1.100",
            portNo: 80,
            protocol: "HTTP",
            macAddress: "00:12:34:56:78:90",
            channelID: 1,
            dateTime: new Date().toISOString(),
            activePostCount: 1,
            eventType: "faceSnapMatch",
            eventState: "active",
            EventNotificationAlert: {
                eventType: "faceSnapMatch",
                eventState: "active",
                eventDescription: "Face match successful",
                dateTime: new Date().toISOString(),
                ActivePost: [{
                    channelID: 1,
                    ipAddress: "192.168.1.100",
                    portNo: 80,
                    protocol: "HTTP",
                    macAddress: "00:12:34:56:78:90",
                    dynChannelID: 1,
                    UniversalUniqueID: "550e8400-e29b-41d4-a716-446655440000",
                    faceLibType: "blackFD",
                    FDID: "1",
                    FPID: req.body.employeeCode || "123456", // Sử dụng employeeCode từ request hoặc mặc định
                    name: req.body.employeeName || "Test Employee",
                    type: "faceMatch",
                    similarity: req.body.similarity || 85,
                    templateID: "template123",
                    dateTime: new Date().toISOString()
                }]
            }
        };

        // Gọi handler thật để test
        const mockReq = {
            body: sampleEvent
        };

        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    res.status(200).json({
                        status: "success",
                        message: "Test event đã được gửi và xử lý",
                        testData: sampleEvent,
                        result: data
                    });
                }
            })
        };

        // Gọi handler
        await exports.handleHikvisionEvent(mockReq, mockRes);

    } catch (error) {
        console.error("Lỗi test Hikvision event:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi khi test event",
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

// Cleanup rawData cũ hơn 7 ngày
exports.cleanupOldRawData = async (req, res) => {
    try {

        const result = await TimeAttendance.cleanupAllOldRawData();

        res.status(200).json({
            status: "success",
            message: `Đã cleanup rawData cũ thành công`,
            modifiedRecords: result.modifiedCount,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Lỗi cleanup rawData:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi cleanup rawData",
            error: error.message
        });
    }
};

// Cleanup duplicate rawData records
exports.cleanupDuplicateRawData = async (req, res) => {
    try {

        const { employeeCode, date } = req.query;

        let result;
        if (employeeCode && date) {
            // Cleanup specific record

            const record = await TimeAttendance.findOne({
                employeeCode,
                date: new Date(date)
            });

            if (record) {
                const originalCount = record.rawData.length;
                record.removeDuplicateRawData();
                await record.save();

                result = {
                    totalProcessed: 1,
                    totalRecordsModified: originalCount !== record.rawData.length ? 1 : 0,
                    totalDuplicatesRemoved: originalCount - record.rawData.length
                };
            } else {
                result = { totalProcessed: 0, totalRecordsModified: 0, totalDuplicatesRemoved: 0 };
            }
        } else {
            // Bulk cleanup
            result = await TimeAttendance.cleanupAllDuplicateRawData();
        }

        res.status(200).json({
            status: "success",
            message: `Đã cleanup duplicate rawData thành công`,
            data: {
                totalProcessed: result.totalProcessed,
                totalRecordsModified: result.totalRecordsModified,
                totalDuplicatesRemoved: result.totalDuplicatesRemoved
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Lỗi cleanup duplicate rawData:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi cleanup duplicate rawData",
            error: error.message
        });
    }
};

// Admin endpoint để cấu hình event filtering
exports.configureEventFiltering = async (req, res) => {
    try {
        const { ignoreOlderThanMinutes, resetServerStartTime } = req.body;
        
        // Cập nhật cấu hình nếu có
        if (ignoreOlderThanMinutes !== undefined) {
            // Sử dụng global variable để update (trong production nên dùng database hoặc config file)
            global.IGNORE_EVENTS_OLDER_THAN_MINUTES = parseInt(ignoreOlderThanMinutes);
            console.log(`📝 Updated event filter to ignore events older than ${ignoreOlderThanMinutes} minutes`);
        }
        
        // Reset server start time nếu yêu cầu
        if (resetServerStartTime === true) {
            global.SERVER_START_TIME = new Date();
            console.log(`🔄 Reset server start time to: ${global.SERVER_START_TIME.toISOString()}`);
        }
        
        res.status(200).json({
            status: "success",
            message: "Cấu hình event filtering đã được cập nhật",
            config: {
                serverStartTime: global.SERVER_START_TIME || SERVER_START_TIME,
                ignoreOlderThanMinutes: global.IGNORE_EVENTS_OLDER_THAN_MINUTES || IGNORE_EVENTS_OLDER_THAN_MINUTES,
                currentTime: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error("Lỗi cấu hình event filtering:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi cấu hình event filtering",
            error: error.message
        });
    }
};

// Get current event filtering status
exports.getEventFilteringStatus = async (req, res) => {
    try {
        const currentTime = new Date();
        const startTime = global.SERVER_START_TIME || SERVER_START_TIME;
        const filterMinutes = global.IGNORE_EVENTS_OLDER_THAN_MINUTES || IGNORE_EVENTS_OLDER_THAN_MINUTES;
        
        const uptime = (currentTime - startTime) / (1000 * 60); // minutes
        
        res.status(200).json({
            status: "success",
            data: {
                serverStartTime: startTime.toISOString(),
                currentTime: currentTime.toISOString(),
                uptimeMinutes: Math.round(uptime * 100) / 100,
                ignoreOlderThanMinutes: filterMinutes,
                eventsAcceptedAfter: startTime.toISOString(),
                eventsIgnoredBefore: new Date(currentTime - filterMinutes * 60 * 1000).toISOString()
            }
        });
        
    } catch (error) {
        console.error("Lỗi lấy event filtering status:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server khi lấy trạng thái event filtering",
            error: error.message
        });
    }
};

// Reset server start time để bỏ qua tất cả events cũ (ADMIN ONLY)
exports.resetServerStartTime = async (req, res) => {
    try {
        const newStartTime = new Date();
        global.SERVER_START_TIME = newStartTime;
        
        console.log(`🔄 ADMIN RESET: Server start time reset to ${newStartTime.toISOString()}`);
        console.log(`📅 All events before ${newStartTime.toISOString()} will be ignored`);
        
        res.status(200).json({
            status: "success",
            message: "Server start time đã được reset - chỉ nhận events mới từ bây giờ",
            data: {
                newServerStartTime: newStartTime.toISOString(),
                previousStartTime: SERVER_START_TIME.toISOString(),
                ignoreOlderThanMinutes: global.IGNORE_EVENTS_OLDER_THAN_MINUTES || IGNORE_EVENTS_OLDER_THAN_MINUTES
            }
        });
        
    } catch (error) {
        console.error("Lỗi reset server start time:", error);
        res.status(500).json({
            status: "error", 
            message: "Lỗi server khi reset start time",
            error: error.message
        });
    }
}; 