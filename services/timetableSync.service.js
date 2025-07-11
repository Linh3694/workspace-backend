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

    if (!classId || !subjectIds?.length || !teacherId) {
        console.log('❌ Missing required parameters for sync');
        return;
    }

    try {
        if (action === "add") {
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
function canAddTeacher(timetableDoc) {
    return (
        timetableDoc &&
        Array.isArray(timetableDoc.teachers) &&
        timetableDoc.teachers.length < 2
    );
}
module.exports = {
    syncTimetableAfterAssignment,
    syncTimetableAfterRoomUpdate,
    canAddTeacher,
};