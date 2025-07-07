const PeriodDefinition = require('../models/PeriodDefinition');

/**
 * Utility để giúp mapping period definitions giữa Excel và Database
 */
class PeriodMappingHelper {
  
  /**
   * Lấy period definitions và tạo mapping cho Excel import
   * @param {string} schoolYearId - ID năm học
   * @param {string} schoolId - ID trường
   * @returns {Object} Object chứa mapping và validation info
   */
  static async createExcelPeriodMapping(schoolYearId, schoolId) {
    try {
      // Lấy tất cả period definitions
      const allPeriods = await PeriodDefinition.find({
        schoolYear: schoolYearId,
        school: schoolId
      }).sort({ periodNumber: 1 });

      // Lọc chỉ lấy regular periods (tiết học thực sự)
      const regularPeriods = allPeriods.filter(p => p.type === 'regular');
      
      if (regularPeriods.length === 0) {
        return {
          success: false,
          error: 'Không tìm thấy regular periods nào',
          mapping: null,
          regularMapping: null
        };
      }

      // Tạo mapping cho TẤT CẢ periods (backward compatibility)
      const fullPeriodMap = {};
      allPeriods.forEach(p => {
        fullPeriodMap[p.periodNumber] = {
          startTime: p.startTime,
          endTime: p.endTime,
          type: p.type,
          label: p.label
        };
      });

      // Tạo mapping cho REGULAR periods (Excel sẽ dùng 1-10)
      const regularPeriodMap = {};
      regularPeriods.forEach((p, index) => {
        const excelPeriodNumber = index + 1; // Excel period: 1, 2, 3, ...
        regularPeriodMap[excelPeriodNumber] = {
          periodNumber: p.periodNumber, // Database period number
          startTime: p.startTime,
          endTime: p.endTime,
          label: p.label
        };
      });

      console.log(`📊 Period mapping summary:`);
      console.log(`   - Total periods: ${allPeriods.length}`);
      console.log(`   - Regular periods: ${regularPeriods.length}`);
      console.log(`   - Excel mapping: 1-${regularPeriods.length} → DB periods ${regularPeriods.map(p => p.periodNumber).join(', ')}`);
      
      return {
        success: true,
        mapping: fullPeriodMap,
        regularMapping: regularPeriodMap,
        summary: {
          totalPeriods: allPeriods.length,
          regularPeriods: regularPeriods.length,
          maxExcelPeriod: regularPeriods.length,
          dbPeriodNumbers: regularPeriods.map(p => p.periodNumber)
        }
      };

    } catch (error) {
      console.error('❌ Error creating period mapping:', error);
      return {
        success: false,
        error: error.message,
        mapping: null,
        regularMapping: null
      };
    }
  }

  /**
   * Validate Excel period number và convert sang database period
   * @param {number} excelPeriodNumber - Period number từ Excel (1-10)
   * @param {Object} regularMapping - Mapping từ createExcelPeriodMapping
   * @returns {Object} Kết quả validation và conversion
   */
  static validateAndConvertExcelPeriod(excelPeriodNumber, regularMapping) {
    if (!regularMapping || typeof regularMapping !== 'object') {
      return {
        valid: false,
        error: 'Invalid regular mapping provided'
      };
    }

    const maxExcelPeriod = Object.keys(regularMapping).length;
    
    if (!excelPeriodNumber || excelPeriodNumber < 1 || excelPeriodNumber > maxExcelPeriod) {
      return {
        valid: false,
        error: `Period ${excelPeriodNumber} không hợp lệ. Chỉ chấp nhận từ 1-${maxExcelPeriod}`
      };
    }

    const mappedPeriod = regularMapping[excelPeriodNumber];
    if (!mappedPeriod) {
      return {
        valid: false,
        error: `Không tìm thấy mapping cho period ${excelPeriodNumber}`
      };
    }

    return {
      valid: true,
      excelPeriod: excelPeriodNumber,
      dbPeriodNumber: mappedPeriod.periodNumber,
      startTime: mappedPeriod.startTime,
      endTime: mappedPeriod.endTime,
      label: mappedPeriod.label
    };
  }

  /**
   * Validate thời khóa biểu record trước khi import
   * @param {Object} record - Record từ Excel
   * @param {Object} mappings - Mappings từ createExcelPeriodMapping
   * @param {Object} classMap - Map từ className sang classId
   * @returns {Object} Kết quả validation
   */
  static validateTimetableRecord(record, mappings, classMap) {
    const errors = [];
    
    // Validate required fields
    if (!record.classCode) {
      errors.push('Thiếu classCode');
    } else if (!classMap[record.classCode]) {
      errors.push(`Không tìm thấy lớp ${record.classCode}`);
    }

    if (!record.subject) {
      errors.push('Thiếu subject');
    }

    if (!record.dayOfWeek) {
      errors.push('Thiếu dayOfWeek');
    } else if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(record.dayOfWeek)) {
      errors.push(`dayOfWeek không hợp lệ: ${record.dayOfWeek}`);
    }

    if (!record.periodNumber) {
      errors.push('Thiếu periodNumber');
    } else {
      const periodValidation = this.validateAndConvertExcelPeriod(record.periodNumber, mappings.regularMapping);
      if (!periodValidation.valid) {
        errors.push(periodValidation.error);
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors: errors,
        record: record
      };
    }

    // Convert Excel period to DB period
    const periodConversion = this.validateAndConvertExcelPeriod(record.periodNumber, mappings.regularMapping);
    
    return {
      valid: true,
      convertedRecord: {
        ...record,
        classId: classMap[record.classCode],
        dbPeriodNumber: periodConversion.dbPeriodNumber,
        startTime: periodConversion.startTime,
        endTime: periodConversion.endTime
      }
    };
  }

  /**
   * Phân tích và báo cáo về period conflicts
   * @param {Array} records - Mảng records đã validate
   * @returns {Object} Báo cáo conflicts
   */
  static analyzeConflicts(records) {
    const conflicts = {
      classTimeConflicts: [],
      teacherTimeConflicts: [],
      roomTimeConflicts: []
    };

    // Group by class + day + time
    const classTimeSlots = {};
    
    // Group by teacher + day + time (nếu có teacher info)
    const teacherTimeSlots = {};
    
    records.forEach((record, index) => {
      const { classId, dayOfWeek, startTime, teachers } = record.convertedRecord;
      const timeSlotKey = `${classId}_${dayOfWeek}_${startTime}`;
      
      // Kiểm tra class conflicts
      if (classTimeSlots[timeSlotKey]) {
        conflicts.classTimeConflicts.push({
          timeSlot: `${dayOfWeek} ${startTime}`,
          conflictingRecords: [classTimeSlots[timeSlotKey], index]
        });
      } else {
        classTimeSlots[timeSlotKey] = index;
      }

      // Kiểm tra teacher conflicts (nếu có)
      if (teachers && Array.isArray(teachers)) {
        teachers.forEach(teacherId => {
          const teacherTimeKey = `${teacherId}_${dayOfWeek}_${startTime}`;
          if (teacherTimeSlots[teacherTimeKey]) {
            conflicts.teacherTimeConflicts.push({
              teacherId: teacherId,
              timeSlot: `${dayOfWeek} ${startTime}`,
              conflictingRecords: [teacherTimeSlots[teacherTimeKey], index]
            });
          } else {
            teacherTimeSlots[teacherTimeKey] = index;
          }
        });
      }
    });

    return {
      hasConflicts: conflicts.classTimeConflicts.length > 0 || conflicts.teacherTimeConflicts.length > 0,
      summary: {
        classConflicts: conflicts.classTimeConflicts.length,
        teacherConflicts: conflicts.teacherTimeConflicts.length,
        roomConflicts: conflicts.roomTimeConflicts.length
      },
      details: conflicts
    };
  }
}

module.exports = PeriodMappingHelper; 