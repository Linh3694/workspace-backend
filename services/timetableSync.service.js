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
        await teacher.save();

        // Tìm các slot timetable của class + subject
        const slots = await Timetable.find({ class: classId, subject: { $in: subjectIds } });
        const slotsToUpdate = slots.filter(slot =>
            !slot.teachers.includes(teacherId) && slot.teachers.length < 2
        );
        if (slotsToUpdate.length > 0) {
            await Timetable.updateMany(
                { _id: { $in: slotsToUpdate.map(s => s._id) } },
                { $addToSet: { teachers: teacherId }, status: "ready", updatedAt: new Date() }
            );
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