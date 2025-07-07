const Timetable = require('../models/Timetable');
const Class = require('../models/Class');
const Curriculum = require('../models/Curriculum');
const EducationalSystem = require('../models/EducationalSystem');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher');
const Room = require('../models/Room');
const GradeLevel = require('../models/GradeLevel');
const SchoolYear = require('../models/SchoolYear');
const School = require('../models/School');

class TimeTableService {
    constructor() {
        this.defaultRules = {
            maxPeriodsPerDayPerSubject: 2,
            maxConsecutivePeriods: 2,
            minBreakBetweenPeriods: 1
        };
    }

    validateConfig(config) {
        const { daysPerWeek, periodsPerDay } = config;
        if (daysPerWeek < 1 || daysPerWeek > 7) {
            throw new Error('Số ngày trong tuần phải từ 1-7');
        }
        if (periodsPerDay < 1 || periodsPerDay > 10) {
            throw new Error('Số tiết mỗi ngày phải từ 1-10');
        }
    }

    async validateTeacherAvailability(teacherId, day, period, teacherAllocation) {
        // Kiểm tra giáo viên có lịch dạy trong tiết này không
        if (teacherAllocation[day][period].size &&
            Array.from(teacherAllocation[day][period]).some(e => e.startsWith(teacherId))) {
            return false;
        }
        return true;
    }

    async validateRoomAvailability(roomId, day, period, roomAllocation, needFunctionRoom) {
        // Kiểm tra phòng học có được sử dụng trong tiết này không
        if (needFunctionRoom && roomAllocation[day][period].has(roomId)) {
            return false;
        }
        return true;
    }

    async getSubjectsForClasses(schoolYearId, schoolId) {
        console.log('\n=== BẮT ĐẦU LẤY DANH SÁCH MÔN HỌC CHO CÁC LỚP ===');
        try {
            // Validate input
            if (!schoolYearId || !schoolId) {
                throw new Error('Thiếu thông tin năm học hoặc trường');
            }

            const result = [];
            console.log('STEP 1: Tìm kiếm khối lớp cho trường', schoolId);
            const gradeLevels = await GradeLevel.find({
                school: schoolId,
                isDeleted: { $ne: true }
            });

            if (!gradeLevels.length) {
                throw new Error('Không tìm thấy khối lớp nào trong trường này');
            }
            console.log(`✅ Tìm thấy ${gradeLevels.length} khối lớp`);

            console.log('\nSTEP 2: Tìm kiếm thông tin lớp học');
            const classes = await Class.find({
                gradeLevel: { $in: gradeLevels.map(gl => gl._id) },
                schoolYear: schoolYearId,
                isDeleted: { $ne: true }
            })
                .populate('gradeLevel')
                .populate({
                    path: 'curriculum',
                    populate: {
                        path: 'subjects.subject',
                        model: 'Subject',
                        populate: [
                            { path: 'rooms', model: 'Room' },
                            { path: 'gradeLevels', model: 'GradeLevel' }
                        ]
                    }
                })
                .populate({
                    path: 'educationalSystem',
                    populate: {
                        path: 'curriculums',
                        populate: {
                            path: 'subjects.subject',
                            model: 'Subject',
                            populate: [
                                { path: 'rooms', model: 'Room' },
                                { path: 'gradeLevels', model: 'GradeLevel' }
                            ]
                        }
                    }
                });

            console.log(`✅ Tìm thấy ${classes.length} lớp học`);

            for (const classInfo of classes) {
                console.log(`\n=== XỬ LÝ LỚP ${classInfo.className} ===`);
                if (!classInfo.gradeLevel || !classInfo.educationalSystem) {
                    console.log(`❌ Bỏ qua lớp ${classInfo.className} do thiếu thông tin`);
                    continue;
                }

                let curriculumSubjectsList = [];
                console.log('STEP 3: Kiểm tra chương trình học của lớp');
                if (classInfo.curriculum && classInfo.curriculum.subjects.length > 0) {
                    console.log('📚 Sử dụng chương trình học riêng của lớp');
                    curriculumSubjectsList = classInfo.curriculum.subjects.map(cs => ({
                        subject: cs.subject,
                        periodsPerWeek: cs.periodsPerWeek
                    }));
                } else if (classInfo.educationalSystem.curriculums.length > 0) {
                    console.log('📚 Sử dụng chương trình học của hệ đào tạo');
                    for (const curriculum of classInfo.educationalSystem.curriculums) {
                        curriculumSubjectsList.push(
                            ...(curriculum.subjects || []).map(cs => ({
                                subject: cs.subject,
                                periodsPerWeek: cs.periodsPerWeek
                            }))
                        );
                    }
                } else {
                    console.log('📚 Sử dụng danh sách môn học mặc định');
                    const fallback = await Subject.find({
                        school: schoolId,
                        gradeLevels: classInfo.gradeLevel._id,
                        isDeleted: { $ne: true }
                    });
                    curriculumSubjectsList = fallback.map(sub => ({
                        subject: sub,
                        periodsPerWeek: 1
                    }));
                }

                if (!curriculumSubjectsList.length) {
                    console.log(`❌ Không tìm thấy môn học nào cho lớp ${classInfo.className}`);
                    continue;
                }

                console.log(`\nSTEP 4: Tìm kiếm thông tin giáo viên và phòng học cho ${curriculumSubjectsList.length} môn học`);
                const subjectsWithDetails = await Promise.all(
                    curriculumSubjectsList.map(async cs => {
                        if (!cs.subject) return null;
                        const teachers = await Teacher.find({
                            school: schoolId,
                            subjects: cs.subject._id,
                            gradeLevels: classInfo.gradeLevel._id,
                            isDeleted: { $ne: true }
                        });
                        let functionRooms = [];
                        let functionRoomStatus = 'not_required';
                        if (cs.subject.needFunctionRoom) {
                            functionRooms = await Room.find({
                                school: schoolId,
                                subjects: cs.subject._id,
                                isDeleted: { $ne: true }
                            });
                            functionRoomStatus = functionRooms.length ? 'assigned' : 'missing';
                        }
                        return {
                            subject: cs.subject,
                            periodsPerWeek: cs.periodsPerWeek,
                            teacherStatus: teachers.length ? 'assigned' : 'missing',
                            teachers,
                            functionRoomStatus,
                            functionRooms,
                            isMainSubject: ['Toán', 'Ngữ văn', 'Vật lý'].includes(cs.subject.name)
                        };
                    })
                );

                console.log('STEP 5: Lọc các môn học trùng lặp');
                const unique = [];
                const seen = new Set();
                for (const s of subjectsWithDetails) {
                    if (s && !seen.has(s.subject._id.toString())) {
                        seen.add(s.subject._id.toString());
                        unique.push(s);
                    }
                }

                result.push({
                    classId: classInfo._id,
                    className: classInfo.className,
                    gradeLevel: classInfo.gradeLevel.name,
                    educationalSystem: classInfo.educationalSystem.name,
                    subjects: unique
                });
                console.log(`✅ Hoàn thành xử lý lớp ${classInfo.className}`);
            }

            console.log('\n=== KẾT THÚC LẤY DANH SÁCH MÔN HỌC ===');
            return result;
        } catch (error) {
            console.error('❌ LỖI TRONG QUÁ TRÌNH LẤY DANH SÁCH MÔN HỌC:', error);
            throw error;
        }
    }

    async generateTimetableForSchool(schoolYearId, schoolId, config = {}) {
        console.log('\n=== BẮT ĐẦU TẠO THỜI KHÓA BIỂU CHO TOÀN TRƯỜNG ===');
        try {
            // Validate input
            if (!schoolYearId || !schoolId) {
                throw new Error('Thiếu thông tin năm học hoặc trường');
            }

            const { daysPerWeek = 5, periodsPerDay = 10 } = config;
            this.validateConfig({ daysPerWeek, periodsPerDay });

            console.log(`📋 Cấu hình: ${daysPerWeek} ngày/tuần, ${periodsPerDay} tiết/ngày`);

            console.log('\nSTEP 1: Kiểm tra thông tin năm học và trường');
            const [schoolYear, school] = await Promise.all([
                SchoolYear.findById(schoolYearId),
                School.findById(schoolId)
            ]);
            if (!schoolYear) {
                console.log('❌ Không tìm thấy năm học');
                throw new Error('Năm học không tồn tại');
            }
            if (!school) {
                console.log('❌ Không tìm thấy trường');
                throw new Error('Trường không tồn tại');
            }
            console.log('✅ Thông tin năm học và trường hợp lệ');

            console.log('\nSTEP 2: Lấy danh sách môn học cho các lớp');
            const classesWithSubjects = await this.getSubjectsForClasses(schoolYearId, schoolId);
            if (!Array.isArray(classesWithSubjects) || !classesWithSubjects.length) {
                console.log('❌ Không tìm thấy lớp nào để tạo thời khóa biểu');
                return { success: false, message: 'Không tìm thấy lớp nào để tạo thời khóa biểu' };
            }
            console.log(`✅ Tìm thấy ${classesWithSubjects.length} lớp để tạo thời khóa biểu`);

            console.log('\nSTEP 3: Xóa thời khóa biểu cũ');
            await Timetable.deleteMany({
                schoolYear: schoolYearId,
                class: { $in: classesWithSubjects.map(c => c.classId) }
            });
            console.log('✅ Đã xóa thời khóa biểu cũ');

            const rules = this.defaultRules;
            const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].slice(0, daysPerWeek);
            
            // Lấy period definitions từ database thay vì hardcode
            const PeriodDefinition = require('../models/PeriodDefinition');
            const periodDefs = await PeriodDefinition.find({
                schoolYear: schoolYearId,
                school: schoolId,
                type: 'regular'
            }).sort({ periodNumber: 1 });

            if (periodDefs.length === 0) {
                console.log('❌ Chưa khai báo tiết học cho trường này');
                return {
                    success: false,
                    message: 'Chưa khai báo tiết học cho trường này. Vui lòng chạy script initPeriodDefinitions.js trước.',
                    errors: ['No period definitions found']
                };
            }

            // Chuyển đổi period definitions thành format cũ để tương thích
            const periods = periodDefs.map(p => ({
                startTime: p.startTime,
                endTime: p.endTime,
                periodNumber: p.periodNumber,
                label: p.label
            })).slice(0, periodsPerDay);

            console.log('\nSTEP 4: Khởi tạo bảng phân bổ giáo viên và phòng học');
            const teacherAllocation = {};
            const roomAllocation = {};
            daysOfWeek.forEach(day => {
                teacherAllocation[day] = Array(periods.length).fill(null).map(() => new Set());
                roomAllocation[day] = Array(periods.length).fill(null).map(() => new Set());
            });
            console.log('✅ Đã khởi tạo bảng phân bổ');

            const allTimetables = [];

            console.log('\nSTEP 5: Bắt đầu phân bổ lịch học cho từng lớp');
            for (const classInfo of classesWithSubjects) {
                console.log(`\n=== XỬ LÝ LỚP ${classInfo.className} ===`);
                if (!classInfo.subjects.length) {
                    console.log(`❌ Bỏ qua lớp ${classInfo.className} do không có môn học`);
                    continue;
                }
                const homeRoom = { _id: classInfo.classId, toString() { return this._id.toString() }, name: `Phòng ${classInfo.className}` };
                const sorted = [...classInfo.subjects].sort((a, b) => {
                    if (a.isMainSubject !== b.isMainSubject) return a.isMainSubject ? -1 : 1;
                    return b.periodsPerWeek - a.periodsPerWeek;
                });

                // Initialize per-class subject-day counters
                const classSubjectDayCount = {};
                sorted.forEach(subj => {
                    const subjId = subj.subject._id.toString();
                    classSubjectDayCount[subjId] = {};
                    daysOfWeek.forEach(day => {
                        classSubjectDayCount[subjId][day] = [];
                    });
                });

                for (const subj of sorted) {
                    console.log(`\n📚 Phân bổ lịch cho môn ${subj.subject.name}`);
                    // Log available teachers for this subject
                    console.log(`🔎 Available teachers for ${subj.subject.name} in class ${classInfo.className}:`, subj.teachers.map(t => t.fullname || t._id));
                    let remain = subj.periodsPerWeek;
                    while (remain > 0) {
                        let done = false;
                        for (let d = 0; d < daysOfWeek.length && !done; d++) {
                            const day = daysOfWeek[d];
                            const subjId = subj.subject._id.toString();
                            const subjDayPeriods = classSubjectDayCount[subjId][day];
                            if (subjDayPeriods.length >= rules.maxPeriodsPerDayPerSubject) {
                                console.log(`⚠️ Đã đạt giới hạn số tiết/ngày cho môn ${subj.subject.name}`);
                                continue;
                            }

                            for (let p = 0; p < periods.length && !done; p++) {
                                console.log(`\n🔍 Kiểm tra tiết ${p + 1} ngày ${day}`);
                                // If already has one period today, ensure second is consecutive
                                if (subjDayPeriods.length === 1 && p !== subjDayPeriods[0] + 1) {
                                    console.log(`⚠️ Tiết thứ 2 cho môn ${subj.subject.name} không nối tiếp`);
                                    continue;
                                }
                                // Try each available teacher for this slot
                                let chosenRoom = homeRoom;
                                if (subj.subject.needFunctionRoom) {
                                    chosenRoom = null;
                                    for (const roomCandidate of subj.functionRooms) {
                                        if (!roomAllocation[day][p].has(roomCandidate._id.toString())) {
                                            chosenRoom = roomCandidate;
                                            break;
                                        }
                                    }
                                    if (!chosenRoom) {
                                        console.log(`    ❌ Không có phòng chức năng trống cho môn ${subj.subject.name} tại ngày ${day} tiết ${p + 1}`);
                                        continue;
                                    }
                                }
                                let chosenTeacher = null;
                                for (const teacherCandidate of subj.teachers) {
                                    console.log(`    - Testing teacher ${teacherCandidate._id.toString()} (${teacherCandidate.fullname}) for slot day ${day} period ${p + 1}`);
                                    if (await this.isValidPeriod(day, p, teacherAllocation, roomAllocation, teacherCandidate._id.toString(), chosenRoom._id.toString(), subj.subject._id.toString(), rules, subj.subject.needFunctionRoom)) {
                                        chosenTeacher = teacherCandidate;
                                        break;
                                    }
                                }
                                if (!chosenTeacher) {
                                    console.log(`    ❌ Không tìm được giáo viên trống cho môn ${subj.subject.name} tại slot ngày ${day} tiết ${p + 1}`);
                                    continue;
                                }
                                console.log(`    ✅ Gán giáo viên ${chosenTeacher.fullname} và phòng ${chosenRoom.name} cho môn ${subj.subject.name} tại ngày ${day} tiết ${p + 1}`);
                                allTimetables.push({
                                    schoolYear: schoolYearId,
                                    class: classInfo.classId,
                                    subject: subj.subject._id,
                                    teacher: chosenTeacher._id,
                                    room: chosenRoom._id,
                                    timeSlot: { dayOfWeek: day, startTime: periods[p].startTime, endTime: periods[p].endTime }
                                });
                                teacherAllocation[day][p].add(`${chosenTeacher._id}:${subj.subject._id}`);
                                classSubjectDayCount[subj.subject._id.toString()][day].push(p);
                                if (subj.subject.needFunctionRoom) roomAllocation[day][p].add(chosenRoom._id.toString());
                                remain--;
                                done = true;
                            }
                        }
                        if (!done) {
                            console.log(`❌ Không thể phân bổ thêm tiết cho môn ${subj.subject.name}`);
                            break;
                        }
                    }
                }
            }

            if (allTimetables.length) {
                console.log('\nSTEP 6: Lưu thời khóa biểu vào cơ sở dữ liệu');
                try {
                    await Timetable.insertMany(allTimetables);
                    console.log(`✅ Đã lưu ${allTimetables.length} lịch học`);
                } catch (dbError) {
                    console.error('❌ Lỗi khi lưu vào database:', dbError);
                    throw new Error('Không thể lưu thời khóa biểu vào cơ sở dữ liệu');
                }
                console.log('=== KẾT THÚC TẠO THỜI KHÓA BIỂU ===');
                return { 
                    success: true,
                    message: `Đã tạo ${allTimetables.length} lịch`,
                    timetableCount: allTimetables.length
                };
            } else {
                return {
                    success: false, 
                    message: 'Không thể phân bổ lịch cho bất kỳ môn nào',
                    errors: ['Không có lịch nào được tạo'] 
                };
            }
        } catch (error) {
            console.error('❌ LỖI TRONG QUÁ TRÌNH TẠO THỜI KHÓA BIỂU:', error);
            return {
                success: false, 
                message: `Lỗi: ${error.message}`,
                errors: [{ error: error.message }] 
            };
        }
    }

    /**
     * Kiểm tra slot có hợp lệ:
     * - Giáo viên không trùng slot
     * - Phòng (nếu cần) không trùng slot
     * - Mỗi môn tối đa 2 tiết/ngày
     * - Nếu là tiết 2 cho môn, phải ngay lập tức nối tiếp tiết 1
     */
    async isValidPeriod(day, periodIndex, teacherAllocation, roomAllocation, teacherId, roomId, subjectId, rules, needFunctionRoom = false) {
        try {
            // Kiểm tra tính hợp lệ của tham số
            if (!day || periodIndex < 0 || !teacherId || !roomId || !subjectId) {
                console.log('❌ Thiếu thông tin cần thiết để kiểm tra tính hợp lệ');
                return false;
            }

            // Kiểm tra giáo viên có lịch dạy không
            const teacherAvailable = await this.validateTeacherAvailability(
                teacherId,
                day,
                periodIndex,
                teacherAllocation
            );
            if (!teacherAvailable) {
                return false;
            }

            // Kiểm tra phòng học có trống không
            const roomAvailable = await this.validateRoomAvailability(
                roomId,
                day,
                periodIndex,
                roomAllocation,
                needFunctionRoom
            );
            if (!roomAvailable) {
                return false;
            }

            // Nếu tới đây là hợp lệ
            console.log('✅ Tiết học hợp lệ');
            return true;
        } catch (err) {
            console.error('❌ LỖI TRONG KIỂM TRA TÍNH HỢP LỆ:', err);
            return false;
        }
    }
}

module.exports = new TimeTableService();