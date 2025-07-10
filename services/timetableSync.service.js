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
            // Tìm tất cả timetable slots cho class + subjects
            const existingSlots = await Timetable.find({
                class: classId,
                subject: { $in: subjectIds }
            });
            
            console.log(`🔍 Found ${existingSlots.length} existing timetable slots for class ${classId}`);
            if (existingSlots.length > 0) {
                console.log('📋 Existing slots details:', existingSlots.map(slot => ({
                    _id: slot._id,
                    subject: slot.subject,
                    teachers: slot.teachers,
                    dayOfWeek: slot.timeSlot?.dayOfWeek,
                    startTime: slot.timeSlot?.startTime
                })));
            }
            
            // Lọc slots có thể thêm teacher (chưa có teacher này và chưa đầy 2 teachers)
            const slotsToUpdate = existingSlots.filter(slot => {
                const teachers = slot.teachers || [];
                const hasTeacher = teachers.some(t => t.toString() === teacherId.toString());
                const canAdd = !hasTeacher && teachers.length < 2;
                
                console.log(`🔎 Slot ${slot._id} analysis:`, {
                    teachers: teachers.map(t => t.toString()),
                    hasTeacher,
                    teacherCount: teachers.length,
                    canAdd
                });
                
                return canAdd;
            });
            
            console.log(`🔍 Can add teacher to ${slotsToUpdate.length} slots`);
            
            if (slotsToUpdate.length > 0) {
                const slotIds = slotsToUpdate.map(s => s._id);
                console.log(`🔧 Updating slots:`, slotIds.map(id => id.toString()));
                
                const updateResult = await Timetable.updateMany(
                    { _id: { $in: slotIds } },
                    {
                        $addToSet: { teachers: teacherId },
                        status: "ready",
                        updatedAt: new Date(),
                    }
                );
                
                console.log(`🔄 Sync timetable ADD: Updated ${updateResult.modifiedCount} slots for teacher ${teacherId}`);
                
                // Verify the update
                const verifySlots = await Timetable.find({ _id: { $in: slotIds } }).select('teachers');
                console.log(`✅ Verification - slots after update:`, verifySlots.map(slot => ({
                    _id: slot._id,
                    teachers: slot.teachers.map(t => t.toString())
                })));
            } else {
                console.log('⚠️ No slots available for adding teacher');
            }
        } else if (action === "remove") {
            console.log(`🗑️ Removing teacher ${teacherId} from slots...`);
            
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