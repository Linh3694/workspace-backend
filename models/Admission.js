const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema(
    {
        schoolYear: {
            type: String,
            required: true,
            default: '2025-2026',
            trim: true
        },
        newStudents: {
            type: Number,
            required: true,
            default: 0
        },
        returningStudents: {
            type: Number,
            required: true,
            default: 0
        },
        totalStudents: {
            type: Number,
            default: 0
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Pre-save middleware để tự động tính tổng số học sinh
admissionSchema.pre('save', function (next) {
    this.totalStudents = this.newStudents + this.returningStudents;
    next();
});

const Admission = mongoose.model('Admission', admissionSchema);

module.exports = Admission;
