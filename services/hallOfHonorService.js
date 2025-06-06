const AwardCategory = require('../models/AwardCategory');
const AwardRecord = require('../models/AwardRecord');
const RedisCache = require('../utils/redisCache');
const { paginate } = require('../utils/pagination');

class HallOfHonorService {
  // Cache categories for 10 minutes
  async getCategories(options = {}) {
    const cacheKey = `categories:${JSON.stringify(options)}`;
    let categories = await RedisCache.get(cacheKey);

    if (!categories) {
      const query = AwardCategory.find();

      if (options.active) {
        query.where({ isActive: true });
      }

      categories = await query.select('-__v').lean().exec();

      await RedisCache.set(cacheKey, categories, 600); // 10 minutes
    }

    return categories;
  }

  // Optimized records fetching with pagination & filtering
  async getRecords(filters = {}, pagination = {}) {
    const {
      categoryId,
      subAwardType,
      subAwardLabel,
      schoolYear,
      semester,
      month,
      studentId,
      classId,
    } = filters;

    const match = {};

    // Build match conditions efficiently
    if (categoryId) match.awardCategory = categoryId;
    if (subAwardType) match['subAward.type'] = subAwardType;
    if (subAwardLabel) match['subAward.label'] = subAwardLabel;
    if (schoolYear) match['subAward.schoolYear'] = schoolYear;
    if (semester !== undefined) match['subAward.semester'] = semester;
    if (month !== undefined) match['subAward.month'] = month;
    if (studentId) match['students.student'] = studentId;
    if (classId) match['awardClasses.class'] = classId;

    // Use aggregation with proper indexing
    const pipeline = [
      { $match: match },

      // Lookup students in batch
      {
        $lookup: {
          from: 'students',
          localField: 'students.student',
          foreignField: '_id',
          as: 'studentDetails',
          pipeline: [{ $project: { name: 1, studentCode: 1, className: 1 } }],
        },
      },

      // Lookup classes in batch
      {
        $lookup: {
          from: 'classes',
          localField: 'awardClasses.class',
          foreignField: '_id',
          as: 'classDetails',
          pipeline: [{ $project: { className: 1, grade: 1 } }],
        },
      },

      // Merge details back
      {
        $addFields: {
          students: {
            $map: {
              input: '$students',
              as: 'student',
              in: {
                $mergeObjects: [
                  '$$student',
                  {
                    studentInfo: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$studentDetails',
                            cond: { $eq: ['$$this._id', '$$student.student'] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                ],
              },
            },
          },
          awardClasses: {
            $map: {
              input: '$awardClasses',
              as: 'awardClass',
              in: {
                $mergeObjects: [
                  '$$awardClass',
                  {
                    classInfo: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$classDetails',
                            cond: { $eq: ['$$this._id', '$$awardClass.class'] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },

      // Sort by priority and creation date
      {
        $sort: {
          'subAward.priority': 1,
          createdAt: -1,
        },
      },

      // Clean up temporary fields
      {
        $project: {
          studentDetails: 0,
          classDetails: 0,
        },
      },
    ];

    // Apply pagination
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;

    if (pagination.enabled !== false) {
      pipeline.push({ $skip: skip }, { $limit: limit });
    }

    const [records, totalCount] = await Promise.all([
      AwardRecord.aggregate(pipeline),
      this.getRecordsCount(match),
    ]);

    return {
      records,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    };
  }

  async getRecordsCount(match) {
    const result = await AwardRecord.aggregate([{ $match: match }, { $count: 'total' }]);
    return result[0]?.total || 0;
  }

  // Batch operations for better performance
  async createRecords(recordsData) {
    const session = await AwardRecord.startSession();

    try {
      session.startTransaction();

      // Validate duplicates in batch
      await this.validateNoDuplicates(recordsData);

      // Insert in batch
      const records = await AwardRecord.insertMany(recordsData, { session });

      await session.commitTransaction();

      // Invalidate cache
      await this.invalidateCache();

      return records;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async validateNoDuplicates(recordsData) {
    // Build bulk validation query
    const validationQueries = recordsData.map((record) => ({
      awardCategory: record.awardCategory,
      'subAward.type': record.subAward.type,
      'subAward.label': record.subAward.label,
      'subAward.schoolYear': record.subAward.schoolYear,
      $or: [
        record.students?.length && {
          'students.student': { $in: record.students.map((s) => s.student) },
        },
        record.awardClasses?.length && {
          'awardClasses.class': { $in: record.awardClasses.map((c) => c.class) },
        },
      ].filter(Boolean),
    }));

    const existingRecords = await AwardRecord.find({
      $or: validationQueries,
    }).lean();

    if (existingRecords.length > 0) {
      throw new Error('Có dữ liệu trùng lặp trong hệ thống');
    }
  }

  async invalidateCache() {
    await RedisCache.deletePattern('categories:*');
    await RedisCache.deletePattern('records:*');
  }

  // Statistics & analytics
  async getStatistics(categoryId, filters = {}) {
    const match = { awardCategory: categoryId, ...filters };

    const stats = await AwardRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$subAward.type',
          totalRecords: { $sum: 1 },
          totalStudents: { $sum: { $size: '$students' } },
          totalClasses: { $sum: { $size: '$awardClasses' } },
        },
      },
    ]);

    return stats;
  }
}

module.exports = new HallOfHonorService();
