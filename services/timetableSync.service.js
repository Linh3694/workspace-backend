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
    if (!classId || !subjectIds?.length || !teacherId) return;

    try {
        if (action === "add") {
            // Thêm teacher vào timetable slots có ít hơn 2 teachers và chưa có teacher này
            const updateResult = await Timetable.updateMany(
                {
                    class: classId,
                    subject: { $in: subjectIds },
                    teachers: { $ne: teacherId }, // Chưa có teacher này
                    $expr: { $lt: [{ $size: { $ifNull: ["$teachers", []] } }, 2] } // Có ít hơn 2 teachers
                },
                {
                    $addToSet: { teachers: teacherId },
                    status: "ready",
                    updatedAt: new Date(),
                }
            );
            
            console.log(`🔄 Sync timetable ADD: Updated ${updateResult.modifiedCount} slots for teacher ${teacherId}`);
        } else if (action === "remove") {
            const removeResult = await Timetable.updateMany(
                { class: classId, subject: { $in: subjectIds } },
                { $pull: { teachers: teacherId }, updatedAt: new Date() }
            );

            // any slot now lacking teachers → back to draft
            const draftResult = await Timetable.updateMany(
                { class: classId, subject: { $in: subjectIds }, teachers: { $size: 0 } },
                { status: "draft" }
            );
            
            console.log(`🔄 Sync timetable REMOVE: Removed teacher from ${removeResult.modifiedCount} slots, ${draftResult.modifiedCount} slots back to draft`);
        }
    } catch (err) {
        console.error("Timetable sync error:", err.message);
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