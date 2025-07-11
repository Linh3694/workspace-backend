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
        const teacher = await Teacher.findById(teacherId);
        if (!teacher) {
            console.log('❌ Teacher not found');
            return;
        }

        if (action === "add") {
            // Loại bỏ các duplicate assignments cho cùng một lớp
            const existingAssignments = teacher.teachingAssignments.filter(
                ta => ta.class.toString() === classId && ta.subjects?.length > 0
            );

            if (existingAssignments.length > 1) {
                // Nếu có nhiều assignments cho cùng một lớp, gộp subjects lại
                const mergedSubjects = [...new Set(
                    existingAssignments.flatMap(ta => 
                        ta.subjects.map(s => s.toString())
                    )
                )];

                // Xóa tất cả assignments cũ của lớp này
                teacher.teachingAssignments = teacher.teachingAssignments.filter(
                    ta => ta.class.toString() !== classId
                );

                // Tạo assignment mới với subjects đã gộp
                teacher.teachingAssignments.push({
                    class: classId,
                    subjects: mergedSubjects
                });
            } else if (existingAssignments.length === 1) {
                // Cập nhật subjects cho assignment hiện tại
                const existingAssignment = existingAssignments[0];
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

            // Lưu thay đổi
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
        } else if (action === "remove") {
            // Xóa subjects khỏi teachingAssignments
            const existingAssignment = teacher.teachingAssignments.find(
                ta => ta.class.toString() === classId
            );

            if (existingAssignment) {
                existingAssignment.subjects = existingAssignment.subjects.filter(
                    s => !subjectIds.includes(s.toString())
                );

                // Nếu không còn subjects nào, xóa assignment
                if (existingAssignment.subjects.length === 0) {
                    teacher.teachingAssignments = teacher.teachingAssignments.filter(
                        ta => ta.class.toString() !== classId
                    );
                }

                await teacher.save();
            }

            // Xóa giáo viên khỏi các slot timetable
            await Timetable.updateMany(
                { class: classId, subject: { $in: subjectIds } },
                { $pull: { teachers: teacherId }, updatedAt: new Date() }
            );
            // Nếu slot không còn giáo viên nào, chuyển về draft
            await Timetable.updateMany(
                { class: classId, subject: { $in: subjectIds }, teachers: { $size: 0 } },
                { status: "draft" }
            );
        }
    } catch (err) {
        console.error("❌ Timetable sync error:", err.message, err.stack);
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