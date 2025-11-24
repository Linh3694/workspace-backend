const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StudentAwardSchema = new Schema(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    note: {
      type: String,
      maxlength: 1000,
    },
    noteEng: {
      type: String,
      maxlength: 1000,
    },
    activity: [
      {
        type: String,
        maxlength: 200,
      },
    ],
    activityEng: [
      {
        type: String,
        maxlength: 200,
      },
    ],
    score: {
      type: String,
      maxlength: 50,
    },
    exam: {
      type: String,
      maxlength: 200,
    },
  },
  { _id: false }
);

const AwardClassSchema = new Schema(
  {
    class: {
      type: Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
      index: true,
    },
    note: {
      type: String,
      maxlength: 1000,
    },
    noteEng: {
      type: String,
      maxlength: 1000,
    },
  },
  { _id: false }
);

const SubAwardDetailSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['month', 'semester', 'year', 'custom', 'custom_with_description'],
      required: true,
      index: true,
    },
    month: {
      type: Number,
      min: 1,
      max: 12,
    },
    semester: {
      type: Number,
      min: 1,
      max: 2,
    },
    year: {
      type: Number,
      min: 2000,
      max: 3000,
    },
    label: {
      type: String,
      maxlength: 200,
      index: true,
    },
    labelEng: {
      type: String,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    descriptionEng: {
      type: String,
      maxlength: 2000,
    },
    schoolYear: {
      type: Schema.Types.ObjectId,
      ref: 'SchoolYear',
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { _id: false }
);

const AwardRecordSchema = new Schema(
  {
    awardCategory: {
      type: Schema.Types.ObjectId,
      ref: 'AwardCategory',
      required: true,
      index: true,
    },
    awardClasses: [AwardClassSchema],
    subAward: {
      type: SubAwardDetailSchema,
      required: true,
    },
    students: [StudentAwardSchema],
    reason: {
      type: String,
      maxlength: 2000,
    },
    meta: {
      type: Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ===== COMPOUND INDEXES cho performance tối ưu =====
AwardRecordSchema.index({
  awardCategory: 1,
  'subAward.type': 1,
  'subAward.label': 1,
});

AwardRecordSchema.index({
  awardCategory: 1,
  'subAward.schoolYear': 1,
  'subAward.priority': 1,
});

AwardRecordSchema.index({
  'students.student': 1,
  awardCategory: 1,
});

AwardRecordSchema.index({
  'awardClasses.class': 1,
  awardCategory: 1,
});

AwardRecordSchema.index({
  createdAt: -1,
  isActive: 1,
});

// Index để tối ưu lookup performance (không unique)
AwardRecordSchema.index(
  {
    awardCategory: 1,
    'subAward.type': 1,
    'subAward.label': 1,
    'subAward.schoolYear': 1,
    'students.student': 1,
  },
  {
    name: 'student_award_lookup',
    background: true
  }
);

AwardRecordSchema.index(
  {
    awardCategory: 1,
    'subAward.type': 1,
    'subAward.label': 1,
    'subAward.schoolYear': 1,
    'awardClasses.class': 1,
  },
  {
    unique: true,
    sparse: true,
    name: 'unique_class_award',
  }
);

// ===== VALIDATION & MIDDLEWARE =====
AwardRecordSchema.pre('save', function (next) {
  // Validate that either students or awardClasses exist
  if (
    (!this.students || this.students.length === 0) &&
    (!this.awardClasses || this.awardClasses.length === 0)
  ) {
    return next(new Error('Phải có ít nhất 1 học sinh hoặc 1 lớp'));
  }

  // Auto-increment version on update
  if (!this.isNew) {
    this.version += 1;
  }

  next();
});

// Virtual để count total recipients
AwardRecordSchema.virtual('totalRecipients').get(function () {
  const studentCount = this.students ? this.students.length : 0;
  const classCount = this.awardClasses ? this.awardClasses.length : 0;
  return studentCount + classCount;
});

// Method để check duplicates
AwardRecordSchema.methods.checkDuplicates = async function () {
  const match = {
    _id: { $ne: this._id },
    awardCategory: this.awardCategory,
    'subAward.type': this.subAward.type,
    'subAward.label': this.subAward.label,
    'subAward.schoolYear': this.subAward.schoolYear,
  };

  if (this.students?.length > 0) {
    const duplicateStudents = await this.constructor.findOne({
      ...match,
      'students.student': { $in: this.students.map((s) => s.student) },
    });
    if (duplicateStudents) {
      throw new Error('Học sinh đã tồn tại trong loại vinh danh này');
    }
  }

  if (this.awardClasses?.length > 0) {
    const duplicateClasses = await this.constructor.findOne({
      ...match,
      'awardClasses.class': { $in: this.awardClasses.map((c) => c.class) },
    });
    if (duplicateClasses) {
      throw new Error('Lớp đã tồn tại trong loại vinh danh này');
    }
  }
};

AwardRecordSchema.statics.bulkCreateWithValidation = async function (records) {
  const session = await this.startSession();

  try {
    session.startTransaction();

    // Pre-validate all records
    for (const record of records) {
      const instance = new this(record);
      await instance.checkDuplicates();
    }

    // Insert if all valid
    const result = await this.insertMany(records, { session });

    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Transform khi trả về JSON
AwardRecordSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('AwardRecord', AwardRecordSchema);
