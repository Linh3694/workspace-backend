// controllers/tripController.js
const { Trip } = require("../../models/Bus");
const DailyTrip = require("../../models/DailyTrip");
const SchoolYear = require("../../models/SchoolYear");

exports.getAllTrips = async (req, res) => {
  try {
    // Determine the current school year based on the current date
    const currentDate = new Date();
    const currentSchoolYear = await SchoolYear.findOne({
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    }).select('_id');
    const schoolYearId = currentSchoolYear ? currentSchoolYear._id : null;

    // Use an aggregation pipeline to merge student details, photos, and current class info
    const trips = await Trip.aggregate([
      // Lookup Route
      {
        $lookup: {
          from: "routes",
          localField: "route",
          foreignField: "_id",
          as: "route"
        }
      },
      { $unwind: "$route" },
      // Lookup Vehicle
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle"
        }
      },
      { $unwind: "$vehicle" },
      // Lookup Staff (Users)
      {
        $lookup: {
          from: "users",
          localField: "staff",
          foreignField: "_id",
          as: "staff"
        }
      },
      { $unwind: "$staff" },
      // Lookup student documents from the students collection based on students.studentId
      {
        $lookup: {
          from: "students",
          localField: "students.studentId",
          foreignField: "_id",
          as: "populatedStudents"
        }
      },
      // Lookup photos from the photos collection matching the current school year
      {
        $lookup: {
          from: "photos",
          let: { studentIds: "$students.studentId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$student", "$$studentIds"] },
                    { $eq: ["$schoolYear", schoolYearId] }
                  ]
                }
              }
            }
          ],
          as: "photos"
        }
      },
      // Lookup student enrollments to fetch current class info based on the current school year
      {
        $lookup: {
          from: "studentclassenrollments",
          let: { studentIds: "$students.studentId", schoolYear: { $literal: schoolYearId } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$student", "$$studentIds"] },
                    { $eq: ["$schoolYear", "$$schoolYear"] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: "classes",
                localField: "class",
                foreignField: "_id",
                as: "classInfo"
              }
            },
            { $unwind: "$classInfo" },
            {
              $project: {
                student: 1,
                currentClass: "$classInfo"
              }
            }
          ],
          as: "studentEnrollments"
        }
      },
      // Merge student info with photo and currentClass
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
                            cond: { $eq: ["$$stu.studentId", "$$ps._id"] }
                          }
                        },
                        0
                      ]
                    },
                    photo: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$photos",
                            as: "ph",
                            cond: { $eq: ["$$stu.studentId", "$$ph.student"] }
                          }
                        },
                        0
                      ]
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
                                  cond: { $eq: ["$$stu.studentId", "$$se.student"] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: "$$enrollment.currentClass"
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]);
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createTrip = async (req, res) => {
  try {
    console.log("Request body:", req.body); // Xem dữ liệu frontend gửi lên

    const { startDate, endDate, departureTime, arrivalTime, ...otherData } = req.body;
    console.log("Parsed startDate:", startDate, "endDate:", endDate);

    // Chuyển đổi thời gian thành dạng `Date`
    const formattedDepartureTime = departureTime
      ? new Date(`${startDate}T${departureTime}:00.000Z`)
      : null;
    const formattedArrivalTime = arrivalTime
      ? new Date(`${startDate}T${arrivalTime}:00.000Z`)
      : null;

    // Tạo Trip (Trip Template)
    const newTrip = new Trip({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      departureTime: formattedDepartureTime,
      arrivalTime: formattedArrivalTime,
      ...otherData,
    });

    // Lưu Trip
    await newTrip.save();

    // Tạo DailyTrip cho mỗi ngày trong khoảng [startDate, endDate]
    let currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
      // Đặt giờ về 0:0:0 (nếu muốn đồng bộ)
      currentDate.setHours(0, 0, 0, 0);

      await DailyTrip.create({
        date: new Date(currentDate),      // Ngày cụ thể
        tripTemplate: newTrip._id,        // Tham chiếu Trip Template
        route: newTrip.route,
        vehicle: newTrip.vehicle,
        staff: newTrip.staff,
        students: newTrip.students,       // Copy danh sách học sinh (nếu cần)
        departureTime: newTrip.departureTime,
        arrivalTime: newTrip.arrivalTime,
        status: "pending",                // Hoặc giá trị mặc định nào đó
        vehicleStatus: "ok",              // Mặc định
        notes: "",
      });

      // Tăng currentDate thêm 1 ngày
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Trả về kết quả Trip vừa tạo
    res.status(201).json(newTrip);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateTrip = async (req, res) => {
  try {
    const { startDate, endDate, departureTime, arrivalTime, ...otherData } = req.body;
    
    // Build updateFields excluding fields like students that shouldn't trigger dailyTrip updates
    let updateFields = { ...otherData };
    
    if (startDate) {
      if (isNaN(new Date(startDate))) {
        return res.status(400).json({ error: "Invalid startDate" });
      }
      updateFields.startDate = new Date(startDate);
    }
    
    if (endDate) {
      updateFields.endDate = new Date(endDate);
    }
    
    if (departureTime && startDate) {
      updateFields.departureTime = new Date(`${startDate}T${departureTime}:00.000Z`);
    }
    
    if (arrivalTime && startDate) {
      updateFields.arrivalTime = new Date(`${startDate}T${arrivalTime}:00.000Z`);
    }
    
    // Update the Trip
    const updatedTrip = await Trip.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    
    if (!updatedTrip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    
    // Determine threshold: update DailyTrips from the later of today and updatedTrip.startDate
    let threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    if (updatedTrip.startDate && updatedTrip.startDate > threshold) {
      threshold = new Date(updatedTrip.startDate);
      threshold.setHours(0, 0, 0, 0);
    }
    
    // Check if any trip template fields that should be propagated are updated
    if (startDate || endDate || departureTime || arrivalTime || otherData.route || otherData.vehicle || otherData.staff || req.body.students) {
      const dailyUpdateFields = {
        route: updatedTrip.route,
        vehicle: updatedTrip.vehicle,
        staff: updatedTrip.staff,
        departureTime: updatedTrip.departureTime,
        arrivalTime: updatedTrip.arrivalTime,
      };
      if (req.body.students) {
        dailyUpdateFields.students = updatedTrip.students;
      }
      await DailyTrip.updateMany(
        { tripTemplate: updatedTrip._id, date: { $gte: threshold } },
        dailyUpdateFields
      );
    }
    
    res.json(updatedTrip);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findByIdAndDelete(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    res.json({ message: "Trip deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Cập nhật trạng thái điểm danh của học sinh trong chuyến xe
exports.updateStudentAttendance = async (req, res) => {
  try {
    const { attendance, confidence } = req.body;
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    
    const studentEntry = trip.students.find(
      (s) => s.studentId.toString() === req.params.studentId
    );
    if (!studentEntry)
      return res.status(404).json({ error: "Student not found in this trip" });
    
    studentEntry.attendance = attendance || studentEntry.attendance;
    studentEntry.confidence =
      confidence !== undefined ? confidence : studentEntry.confidence;
    studentEntry.updatedAt = new Date();
    
    await trip.save();
    res.json(trip);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};