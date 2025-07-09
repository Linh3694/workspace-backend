const AwardRecord = require("../../models/AwardRecord");
const AwardCategory = require("../../models/AwardCategory");
const xlsx = require('xlsx');

// awardRecordController.js
exports.createAwardRecord = async (req, res) => {
  try {
    // If custom subAward, inherit priority and labelEng from its category definition
    if (req.body.subAward?.type === "custom") {
      const cat = await AwardCategory.findById(req.body.awardCategory);
      const catSub = cat?.subAwards.find(
        (s) => s.type === "custom" && s.label === req.body.subAward.label
      );
      if (catSub) {
        if (catSub.priority != null) {
          req.body.subAward.priority = catSub.priority;
        }
        if (catSub.labelEng) {
          req.body.subAward.labelEng = catSub.labelEng;
        }
      }
    }

    if (Array.isArray(req.body.students)) {
      const seenStu = new Set();
      req.body.students = req.body.students.filter((s) => {
        const id = s.student?.toString();
        if (!id || seenStu.has(id)) return false;
        seenStu.add(id);
        return true;
      });
    }

    if (Array.isArray(req.body.awardClasses)) {
      const seenCls = new Set();
      req.body.awardClasses = req.body.awardClasses.filter((c) => {
        const id = c.class?.toString();
        if (!id || seenCls.has(id)) return false;
        seenCls.add(id);
        return true;
      });
    }
    // 2) Prevent duplicates that already exist in **other** records
    const baseMatch = {
      awardCategory: req.body.awardCategory,
      "subAward.type": req.body.subAward.type,
      "subAward.label": req.body.subAward.label,
      "subAward.schoolYear": req.body.subAward.schoolYear,
    };
    if (req.body.subAward.semester != null)
      baseMatch["subAward.semester"] = req.body.subAward.semester;
    if (req.body.subAward.month != null)
      baseMatch["subAward.month"] = req.body.subAward.month;

    // 2a) Students
    if (req.body.students?.length) {
      const dupStu = await AwardRecord.findOne({
        ...baseMatch,
        "students.student": { $in: req.body.students.map((s) => s.student) },
      }).lean();
      if (dupStu) {
        return res
          .status(400)
          .json({ message: "Học sinh đã tồn tại trong loại vinh danh này" });
      }
    }

    // 2b) Classes
    if (req.body.awardClasses?.length) {
      const dupCls = await AwardRecord.findOne({
        ...baseMatch,
        "awardClasses.class": {
          $in: req.body.awardClasses.map((c) => c.class),
        },
      }).lean();
      if (dupCls) {
        return res
          .status(400)
          .json({ message: "Lớp đã tồn tại trong loại vinh danh này" });
      }
    }

    const newRecord = await AwardRecord.create(req.body);
    return res.status(201).json(newRecord);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// awardRecordController.js
exports.getAllAwardRecords = async (req, res) => {
  try {
    // --- Optional filtering via query params ---
    const match = {};
    const mongoose = require("mongoose");
    const castIfObjectId = (v) =>
      typeof v === "string" && mongoose.isValidObjectId(v)
        ? new mongoose.Types.ObjectId(v)
        : v;
    if (req.query.awardCategory) match.awardCategory = req.query.awardCategory;
    if (req.query.subAwardType) match["subAward.type"] = req.query.subAwardType;
    if (req.query.subAwardLabel) match["subAward.label"] = req.query.subAwardLabel;
    if (req.query.subAwardSchoolYear)
      match["subAward.schoolYear"] = req.query.subAwardSchoolYear;
    if (req.query.subAwardSemester != null && req.query.subAwardSemester !== "")
      match["subAward.semester"] = Number(req.query.subAwardSemester);
    if (req.query.subAwardMonth != null && req.query.subAwardMonth !== "")
      match["subAward.month"] = Number(req.query.subAwardMonth);

    // 🔄 Cast string ids to real ObjectId so that $match works in aggregation
    Object.keys(match).forEach((k) => {
      const v = match[k];
      if (Array.isArray(v)) {
        match[k] = v.map(castIfObjectId);
      } else {
        match[k] = castIfObjectId(v);
      }
    });

    const pipeline = [];

    // Apply dynamic match stage only when filter fields are provided
    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push(
      // (1) Lookup thông tin Student
      {
        $lookup: {
          from: "students",
          localField: "students.student",
          foreignField: "_id",
          as: "populatedStudents",
        },
      },
      // (2) Lookup ảnh Photo (dựa theo danh sách student và schoolYear)
      {
        $lookup: {
          from: "photos",
          let: {
            studentIds: "$students.student",
            yearId: "$subAward.schoolYear",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$student", "$$studentIds"] },
                    { $eq: ["$schoolYear", "$$yearId"] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } }, // Lấy ảnh mới nhất
          ],
          as: "photos",
        },
      },
      // (2b) Lookup ảnh Photo fallback cho current school year
      {
        $lookup: {
          from: "photos",
          let: {
            studentIds: "$students.student",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$student", "$$studentIds"],
                },
              },
            },
            { $sort: { createdAt: -1 } }, // Lấy ảnh mới nhất
          ],
          as: "fallbackPhotos",
        },
      },
      // (3) Lookup AwardCategory
      {
        $lookup: {
          from: "awardcategories",
          localField: "awardCategory",
          foreignField: "_id",
          as: "awardCategory",
        },
      },
      { $unwind: { path: "$awardCategory", preserveNullAndEmptyArrays: true } },
      // (4) Lookup AwardClasses
      {
        $lookup: {
          from: "classes",
          localField: "awardClasses.class",
          foreignField: "_id",
          as: "awardClassesInfo",
        },
      },
      // (5) Lookup StudentClassEnrollment và join với thông tin Class
      {
        $lookup: {
          from: "studentclassenrollments",
          let: { studentIds: "$students.student", schoolYear: "$subAward.schoolYear" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$student", "$$studentIds"] },
                    { $eq: ["$schoolYear", "$$schoolYear"] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "classes",
                localField: "class",
                foreignField: "_id",
                as: "classInfo",
              },
            },
            { $unwind: "$classInfo" },
            {
              $project: {
                student: 1,
                currentClass: "$classInfo",
              },
            },
          ],
          as: "studentEnrollments",
        },
      },
      // (6) Merge thông tin student, photo và currentClass vào mảng students
      {
        $addFields: {
          students: {
            $map: {
              input: "$students",
              as: "stu",
              in: {
                $mergeObjects: [
                  "$$stu",
                  {
                    student: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$populatedStudents",
                            as: "ps",
                            cond: { $eq: ["$$stu.student", "$$ps._id"] },
                          },
                        },
                        0,
                      ],
                    },
                    photo: {
                      $let: {
                        vars: {
                          primaryPhoto: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$photos",
                                  as: "ph",
                                  cond: { $eq: ["$$stu.student", "$$ph.student"] },
                                },
                              },
                              0,
                            ],
                          },
                          fallbackPhoto: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$fallbackPhotos",
                                  as: "fph",
                                  cond: { $eq: ["$$stu.student", "$$fph.student"] },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: {
                          $cond: {
                            if: { $ne: ["$$primaryPhoto", null] },
                            then: "$$primaryPhoto",
                            else: "$$fallbackPhoto",
                          },
                        },
                      },
                    },
                    currentClass: {
                      $let: {
                        vars: {
                          enrollment: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$studentEnrollments",
                                  as: "se",
                                  cond: { $eq: ["$$se.student", "$$stu.student"] },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: "$$enrollment.currentClass",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          awardClasses: {
            $map: {
              input: "$awardClasses",
              as: "ac",
              in: {
                $mergeObjects: [
                  "$$ac",
                  {
                    classInfo: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$awardClassesInfo",
                            as: "info",
                            cond: { $eq: ["$$info._id", "$$ac.class"] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      // (7) Loại bỏ các trường tạm thời
      {
        $project: {
          populatedStudents: 0,
          studentEnrollments: 0,
          photos: 0,
          fallbackPhotos: 0,
          awardClassesInfo: 0
        },
      },
      {
        $addFields: {
          subAward: {
            $cond: {
              if: { $eq: ["$subAward.type", "custom"] },
              then: {
                $mergeObjects: [
                  "$subAward",
                  { priority: { $ifNull: ["$subAward.priority", 0] } }
                ]
              },
              else: "$subAward"
            }
          }
        }
      },
      {
        $sort: {
          "subAward.priority": 1
        }
      }
    );

    const records = await AwardRecord.aggregate(pipeline);

    // Debug: Log photo info
    console.log(`📸 Award Records with photos: ${records.length} records`);
    records.forEach((record, index) => {
      if (index < 2) { // Log first 2 records
        console.log(`Record ${index + 1}:`, {
          students: record.students.map(s => ({
            name: s.student?.name,
            hasPhoto: !!s.photo,
            photoUrl: s.photo?.photoUrl
          }))
        });
      }
    });

    res.json(records);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Lấy 1 AwardRecord theo ID
exports.getAwardRecordById = async (req, res) => {
  try {
    const record = await AwardRecord.findById(req.params.id)
      .populate({
        path: "students",
        populate: { path: "student", model: "Student" },
      })
      .populate("awardCategory");
    if (!record) return res.status(404).json({ message: "Không tìm thấy AwardRecord" });
    return res.json(record);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Cập nhật AwardRecord
exports.updateAwardRecord = async (req, res) => {
  try {
    console.log('🔍 BACKEND: Received update request for record:', req.params.id);
    console.log('🔍 BACKEND: Request body:', JSON.stringify(req.body, null, 2));
    
    // Get original record to compare
    const originalRecord = await AwardRecord.findById(req.params.id);
    console.log('🔍 BACKEND: Original record students:', originalRecord?.students);

    // If custom subAward, inherit priority and labelEng from its category definition
    if (req.body.subAward?.type === "custom") {
      const cat = await AwardCategory.findById(req.body.awardCategory);
      const catSub = cat?.subAwards.find(
        (s) => s.type === "custom" && s.label === req.body.subAward.label
      );
      if (catSub) {
        if (catSub.priority != null) {
          req.body.subAward.priority = catSub.priority;
        }
        if (catSub.labelEng) {
          req.body.subAward.labelEng = catSub.labelEng;
        }
      }
    }

    // --- Merge logic for updating a single class (avoid losing other classes) ---
    if (
      Array.isArray(req.body.awardClasses) &&
      req.body.awardClasses.length === 1 &&
      originalRecord &&
      Array.isArray(originalRecord.awardClasses) &&
      originalRecord.awardClasses.length > 1
    ) {
      const updatedClass = req.body.awardClasses[0];
      const updatedClassId = (updatedClass.class?._id || updatedClass.class)?.toString();
      console.log('🔍 Merge class: Looking for classId =', updatedClassId);
      console.log('🔍 Original awardClasses:', originalRecord.awardClasses.map(c => (c.class?._id || c.class)?.toString()));
      // Tìm vị trí lớp cần cập nhật trong mảng cũ
      const idx = originalRecord.awardClasses.findIndex(
        (c) => {
          const cid = (c.class?._id || c.class)?.toString();
          return cid === updatedClassId;
        }
      );
      if (idx !== -1) {
        // Tạo mảng mới giữ nguyên các lớp khác, chỉ cập nhật lớp này
        const mergedClasses = [...originalRecord.awardClasses];
        mergedClasses[idx] = { ...mergedClasses[idx], ...updatedClass };
        req.body.awardClasses = mergedClasses;
        console.log('🔍 Merge class: Updated class at idx', idx);
      } else {
        // Nếu không tìm thấy, thêm vào cuối mảng
        req.body.awardClasses = [...originalRecord.awardClasses, updatedClass];
        console.log('🔍 Merge class: Not found, appended new class');
      }
    }

    // --- Deduplication & duplicate guard (students / classes) ---
    // TEMPORARILY DISABLED - causing data loss during updates
    /*
    if (Array.isArray(req.body.students)) {
      console.log('🔍 BACKEND: Processing students array, length:', req.body.students.length);
      console.log('🔍 BACKEND: Sample student object:', req.body.students[0]);
      
      const seenStu = new Set();
      req.body.students = req.body.students.filter((s) => {
        // Handle both ObjectId and populated student object
        const id = s.student?._id?.toString() || s.student?.toString();
        console.log('🔍 BACKEND: Processing student ID:', id);
        
        if (!id || seenStu.has(id)) {
          console.log('🔍 BACKEND: Filtering out student (no ID or duplicate):', id);
          return false;
        }
        seenStu.add(id);
        return true;
      });
      
      console.log('🔍 BACKEND: After deduplication, students length:', req.body.students.length);
    }
    */

    /*
    if (Array.isArray(req.body.awardClasses)) {
      const seenCls = new Set();
      req.body.awardClasses = req.body.awardClasses.filter((c) => {
        const id = c.class?.toString();
        if (!id || seenCls.has(id)) return false;
        seenCls.add(id);
        return true;
      });
    }
    */

    const baseMatch = {
      _id: { $ne: req.params.id }, // exclude current record
      awardCategory: req.body.awardCategory,
      "subAward.type": req.body.subAward.type,
      "subAward.label": req.body.subAward.label,
      "subAward.schoolYear": req.body.subAward.schoolYear,
    };
    if (req.body.subAward.semester != null)
      baseMatch["subAward.semester"] = req.body.subAward.semester;
    if (req.body.subAward.month != null)
      baseMatch["subAward.month"] = req.body.subAward.month;

    if (req.body.students?.length) {
      const dupStu = await AwardRecord.findOne({
        ...baseMatch,
        "students.student": { $in: req.body.students.map((s) => s.student) },
      }).lean();
      if (dupStu) {
        return res
          .status(400)
          .json({ message: "Học sinh đã tồn tại trong loại vinh danh này" });
      }
    }

    if (req.body.awardClasses?.length) {
      const dupCls = await AwardRecord.findOne({
        ...baseMatch,
        "awardClasses.class": {
          $in: req.body.awardClasses.map((c) => c.class),
        },
      }).lean();
      if (dupCls) {
        return res
          .status(400)
          .json({ message: "Lớp đã tồn tại trong loại vinh danh này" });
      }
    }

    const updatedRecord = await AwardRecord.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedRecord) return res.status(404).json({ message: "Không tìm thấy AwardRecord" });
    
    console.log('🔍 BACKEND: Updated record students:', updatedRecord.students);
    console.log('🔍 BACKEND: Students count - Original:', originalRecord?.students?.length, 'Updated:', updatedRecord.students?.length);
    
    return res.json(updatedRecord);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Xoá AwardRecord
exports.deleteAwardRecord = async (req, res) => {
  try {
    const deleted = await AwardRecord.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Không tìm thấy AwardRecord" });
    return res.json({ message: "Xoá AwardRecord thành công" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Xử lý upload file Excel cho học sinh
exports.uploadExcelStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng tải lên file Excel" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ message: "File Excel không có dữ liệu" });
    }

    const students = data.map((row) => ({
      student: row["StudentCode"],
      exam: (row["Exam"] || "").toString().trim(),
      // Score có thể là số hoặc chuỗi
      score:
        row["Score"] !== undefined && row["Score"] !== null
          ? isNaN(Number(row["Score"]))
            ? row["Score"].toString().trim()
            : Number(row["Score"])
          : "",
    }));

    // Remove duplicate student codes within the uploaded file itself
    const seenIds = new Set();
    const uniqueStudents = students.filter((s) => {
      const id = s.student?.toString();
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    // Validate dữ liệu
    const invalidStudents = uniqueStudents.filter(
      (s) => !s.student || !s.exam || s.score === "" || s.score === undefined
    );
    if (invalidStudents.length > 0) {
      return res.status(400).json({
        message: `Có ${invalidStudents.length} dòng thiếu StudentCode, Exam hoặc Score`,
        invalidRows: invalidStudents
      });
    }

    return res.status(200).json({
      message: "Đọc file thành công",
      students: uniqueStudents,
      totalStudents: uniqueStudents.length
    });

  } catch (error) {
    console.error("Error processing Excel file:", error);
    return res.status(400).json({
      message: "Có lỗi xảy ra khi xử lý file Excel",
      error: error.message
    });
  }
};

// Thêm require model Class ở đầu file
const Class = require("../../models/Class");

// Xử lý upload file Excel cho lớp
exports.uploadExcelClasses = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng tải lên file Excel" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ message: "File Excel không có dữ liệu" });
    }

    // Chuẩn hóa: cho phép cả cột "ClassName"/"Tên lớp" ngoài "Mã lớp"/"ID"
    const classesRaw = data.map((row) => ({
      raw: row,
      classCode:
        row["Mã lớp"] ||
        row["ID"] ||
        row["ClassName"] ||
        row["Tên lớp"] ||
        "", // fallback rỗng
      note: row["Ghi chú"] || "",
      noteEng: row["Ghi chú (EN)"] || "",
    }));

    const classes = [];
    const invalidRows = [];
    const seenIds = new Set();

    for (const item of classesRaw) {
      const code = String(item.classCode || "").trim();
      if (!code) {
        // Bỏ qua dòng trống hoàn toàn
        continue;
      }
      let classId = code;

      // Nếu chưa phải ObjectId, thử lookup theo className / classCode
      if (!/^[0-9a-fA-F]{24}$/.test(code)) {
        const found = await Class.findOne({
          $or: [{ className: code }, { classCode: code }],
        }).lean();
        if (found) {
          classId = found._id;
        } else {
          invalidRows.push({ ...item.raw, reason: "Không tìm thấy lớp" });
          continue; // skip row không map được
        }
      }

      if (seenIds.has(classId.toString())) {
        continue; // skip duplicates within the file
      }
      seenIds.add(classId.toString());

      classes.push({
        class: classId,
        note: item.note,
        noteEng: item.noteEng,
      });
    }

    // Không trả lỗi nếu có row không hợp lệ, chỉ cảnh báo
    return res.status(200).json({
      message: "Đọc file thành công",
      classes,
      totalRows: classesRaw.length,
      imported: classes.length,
      invalidRows,
    });

  } catch (error) {
    console.error("Error processing Excel file:", error);
    return res.status(400).json({
      message: "Có lỗi xảy ra khi xử lý file Excel",
      error: error.message
    });
  }
};


