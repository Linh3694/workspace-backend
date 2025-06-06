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
            await Timetable.updateMany(
                {
                    class: classId,
                    subject: { $in: subjectIds },
                    $or: [{ teachers: { $exists: false } }, { teachers: { $size: 0 } }],
                },
                {
                    $addToSet: { teachers: teacherId },
                    status: "ready",
                    updatedAt: new Date(),
                }
            );
        } else if (action === "remove") {
            await Timetable.updateMany(
                { class: classId, subject: { $in: subjectIds } },
                { $pull: { teachers: teacherId }, updatedAt: new Date() }
            );

            // any slot now lacking teachers → back to draft
            await Timetable.updateMany(
                { class: classId, subject: { $in: subjectIds }, teachers: { $size: 0 } },
                { status: "draft" }
            );
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