/**
 * Timetable Sync Service
 * --------------------------------------------------
 *  syncTimetableAfterAssignment({ classId, subjectIds, teacherId, action })
 *      action = "add"    → add teacher when teachers array empty
 *      action = "remove" → pull teacher; if teachers empty ⇒ status="draft"
 *
 *  syncTimetableAfterRoomUpdate({ subjectId, roomId })
 *      fill room when room is null / undefined
 */

const Timetable = require("../models/Timetable");
const Teacher = require("../models/Teacher");
const Class = require("../models/Class");

async function syncTimetableAfterAssignment({
    classId,
    subjectIds,
    teacherId,
    action = "add",
}) {
    console.log(`🚀 syncTimetableAfterAssignment called with:`, {
        classId,
        subjectIds,
        teacherId,
        action
    });

    if (!classId || !teacherId) {
        console.log('❌ Missing required parameters: classId or teacherId');
        return;
    }

    // Bỏ qua nếu không có subjects để đồng bộ
    if (!subjectIds?.length) {
        console.log('ℹ️ No subjects to sync, skipping...');
        return;
    }

    try {
        // Kiểm tra và cập nhật teachingAssignments
        const teacher = await Teacher.findById(teacherId).populate({
            path: 'teachingAssignments',
            populate: {
                path: 'class',
                model: 'Class',
                select: '_id className'
            }
        });

        if (!teacher) {
            console.log('❌ Teacher not found');
            return;
        }

        // Lấy thông tin lớp để đảm bảo classId đúng
        const classInfo = await Class.findById(classId).select('_id className');
        if (!classInfo) {
            console.log('❌ Class not found');
            return;
        }

        if (action === "add") {
            // Gom nhóm assignments theo lớp và loại bỏ các assignment trống
            const assignmentsByClass = {};
            teacher.teachingAssignments.forEach(ta => {
                const className = ta.class.className;
                if (!assignmentsByClass[className]) {
                    assignmentsByClass[className] = [];
                }
                if (ta.subjects && ta.subjects.length > 0) {
                    assignmentsByClass[className].push(ta);
                }
            });

            // Chỉ giữ lại một assignment cho mỗi lớp (ưu tiên assignment có nhiều subjects nhất)
            const uniqueAssignments = Object.values(assignmentsByClass).map(assignments => {
                return assignments.reduce((prev, curr) => 
                    (curr.subjects?.length || 0) > (prev.subjects?.length || 0) ? curr : prev
                );
            });

            // Cập nhật teachingAssignments của giáo viên
            teacher.teachingAssignments = uniqueAssignments;

            // Thêm assignment mới hoặc cập nhật assignment hiện tại
            const existingAssignment = uniqueAssignments.find(a => a.class._id.toString() === classId);
            if (existingAssignment) {
                // Gộp subjects và loại bỏ trùng lặp
                const updatedSubjects = [...new Set([
                    ...existingAssignment.subjects.map(s => s.toString()),
                    ...subjectIds
                ])];
                existingAssignment.subjects = updatedSubjects;
            } else {
                // Tạo assignment mới
                teacher.teachingAssignments.push({
                    class: classId,
                    subjects: subjectIds
                });
            }

            await teacher.save();

            // Đồng bộ với thời khóa biểu
            const updateResult = await Timetable.updateMany(
                {
                    class: classId,
                    subject: { $in: subjectIds },
                    $or: [
                        { teachers: { $exists: false } },
                        { teachers: null },
                        { teachers: [] },
                        { teachers: { $ne: teacherId }, $expr: { $lt: [{ $size: "$teachers" }, 2] } }
                    ]
                },
                {
                    $addToSet: { teachers: teacherId },
                    $set: { 
                        updatedAt: new Date(),
                        status: "ready" // Đảm bảo trạng thái là ready khi có giáo viên
                    }
                }
            );
            
            console.log(`✅ Timetable update result: ${updateResult.matchedCount} matched, ${updateResult.modifiedCount} modified`);

        } else if (action === "remove") {
            // Xóa subjects khỏi assignment
            const existingAssignment = teacher.teachingAssignments.find(
                ta => ta.class._id.toString() === classId
            );

            if (existingAssignment) {
                existingAssignment.subjects = existingAssignment.subjects.filter(
                    s => !subjectIds.includes(s.toString())
                );

                // Nếu không còn subjects nào, xóa assignment
                if (existingAssignment.subjects.length === 0) {
                    teacher.teachingAssignments = teacher.teachingAssignments.filter(
                        ta => ta.class._id.toString() !== classId
                    );
                }

                await teacher.save();

                // Xóa giáo viên khỏi các slot timetable
                await Timetable.updateMany(
                    { class: classId, subject: { $in: subjectIds }, teachers: teacherId },
                    { 
                        $pull: { teachers: teacherId },
                        $set: { updatedAt: new Date() }
                    }
                );

                // Nếu slot không còn giáo viên nào, chuyển về draft
                await Timetable.updateMany(
                    { class: classId, subject: { $in: subjectIds }, teachers: { $size: 0 } },
                    { $set: { status: "draft" } }
                );
            }
        }

    } catch (error) {
        console.error('Error in syncTimetableAfterAssignment:', error);
        throw error;
    }
}

async function syncTimetableAfterRoomUpdate({ subjectId, roomId }) {
    if (!subjectId || !roomId) return;
    try {
        await Timetable.updateMany(
            {
                subject: subjectId,
                $or: [{ room: null }, { room: { $exists: false } }],
            },
            {
                room: roomId,
                status: "ready",
                updatedAt: new Date(),
            }
        );
    } catch (err) {
        console.error("Timetable room-sync error:", err.message);
    }
}

module.exports = {
    syncTimetableAfterAssignment,
    syncTimetableAfterRoomUpdate,
};