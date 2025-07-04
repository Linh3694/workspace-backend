const Inspect = require('../../models/Inspect');
const path = require("path");


// Lấy danh sách tất cả các bản ghi kiểm tra
exports.getAllInspections = async (req, res) => {
  try {
    const { deviceId, inspectorId, startDate, endDate } = req.query;

    const filter = {};
    if (deviceId) filter.deviceId = deviceId;
    if (inspectorId) filter.inspectorId = inspectorId;
    if (startDate && endDate) {
      filter.inspectionDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const inspections = await Inspect.find(filter).populate('deviceId inspectorId');
    res.status(200).json({ data: inspections });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inspections', error });
  }
};

// Lấy chi tiết một bản ghi kiểm tra
exports.getInspectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const inspection = await Inspect.findById(id).populate('deviceId inspectorId');

    if (!inspection) {
      return res.status(404).json({ message: 'Inspection not found' });
    }

    res.status(200).json({ data: inspection });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inspection', error });
  }
};

// Thêm bản ghi kiểm tra mới
exports.createInspection = async (req, res) => {
  console.log("Full Payload:", req.body);
  console.log("CPU Data from Payload:", req.body.results?.cpu);
  try {
    const {
      deviceId,
      inspectorId,
      results,
      passed,
      recommendations,
      technicalConclusion,
      followUpRecommendation
    } = req.body;
    
    const cpu = results?.cpu;
    console.log("CPU Data:", cpu);
    
    // Kiểm tra CPU
    if (!cpu?.performance || !cpu?.temperature) {
      return res.status(400).json({ message: "Thông tin CPU không hợp lệ." });
    }

    // Kiểm tra các trường bắt buộc
    if (!deviceId || !inspectorId) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });
    }
    
    const newInspection = new Inspect({
      deviceId,
      inspectorId,
      inspectionDate: new Date(),
      results,
      passed: passed || false, // Mặc định là false nếu không có
      recommendations: JSON.stringify(recommendations),
      technicalConclusion: technicalConclusion || "",
      followUpRecommendation: followUpRecommendation || ""
    });

    await newInspection.save();

    res.status(201).json({ message: "Inspection created successfully", data: newInspection });
  } catch (error) {
    console.error("Error creating inspection:", error);
    res.status(500).json({ message: "Error creating inspection", error });
  }
};

// Xóa một bản ghi kiểm tra
exports.deleteInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedInspection = await Inspect.findByIdAndDelete(id);

    if (!deletedInspection) {
      return res.status(404).json({ message: 'Inspection not found' });
    }

    res.status(200).json({ message: 'Inspection deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting inspection', error });
  }
};

// Cập nhật bản ghi kiểm tra
exports.updateInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Nếu recommendations là object, chuyển sang chuỗi JSON
    if (typeof updatedData.recommendations === "object") {
      updatedData.recommendations = JSON.stringify(updatedData.recommendations);
    }

    const updatedInspection = await Inspect.findByIdAndUpdate(id, updatedData, {
      new: true,
    });

    if (!updatedInspection) {
      return res.status(404).json({ message: "Inspection not found" });
    }

    res.status(200).json({ message: "Inspection updated successfully", data: updatedInspection });
  } catch (error) {
    console.error("Error updating inspection:", error);
    res.status(500).json({ message: "Error updating inspection", error });
  }
};

// Lấy lần kiểm tra mới nhất theo deviceId
exports.getLatestInspectionByDeviceId = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const inspection = await Inspect.findOne({ deviceId })
      .sort({ inspectionDate: -1 }) // Lấy lần kiểm tra mới nhất
      .populate('inspectorId', 'fullname jobTitle email'); // Chỉ lấy các trường cần thiết

    if (!inspection) {
      return res.status(404).json({ message: 'Không tìm thấy dữ liệu kiểm tra' });
    }

    res.status(200).json({ 
      message: 'Dữ liệu kiểm tra', 
      data: {
        _id: inspection._id,  // Kiểm tra xem có _id không
        inspectionDate: inspection.inspectionDate,
        inspectorName: inspection.inspectorId?.fullname || 'Không xác định',
        results: inspection.results,
        overallCondition: inspection.results?.["Tổng thể"]?.overallCondition || 'Không xác định',
        documentUrl: inspection.report?.filePath || "#",
        technicalConclusion: inspection.technicalConclusion || "",
        followUpRecommendation: inspection.followUpRecommendation || ""
      }
    });
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu kiểm tra:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

exports.uploadReport = async (req, res) => {
  console.log("📥 Nhận request tải lên:", req.body);
  console.log("📂 File nhận được:", req.file);

  try {
    const { inspectId } = req.body;

    if (!inspectId || inspectId === "undefined") {
      console.error("❌ Lỗi: inspectId không hợp lệ:", inspectId);
      return res.status(400).json({ message: "Inspect ID không hợp lệ." });
    }

    const inspectionRecord = await Inspect.findById(inspectId);
    if (!inspectionRecord) {
      console.error("❌ Không tìm thấy dữ liệu kiểm tra với ID:", inspectId);
      return res.status(404).json({ message: "Không tìm thấy dữ liệu kiểm tra" });
    }

    if (!req.file) {
      console.error("❌ Không có file trong request!");
      return res.status(400).json({ message: "Không có file được tải lên" });
    }

    // Lưu đường dẫn file vào MongoDB
    inspectionRecord.report = {
      fileName: req.file.filename,
      filePath: `/uploads/reports/${req.file.filename}`,
    };
    await inspectionRecord.save();

    console.log("✅ Biên bản đã được lưu:", inspectionRecord.report);
    res.status(201).json({
      message: "Biên bản đã được lưu thành công",
      data: inspectionRecord,
    });
  } catch (error) {
    console.error("🚨 Lỗi khi tải lên biên bản:", error);
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

exports.downloadReport = async (req, res) => {
  try {
    const { inspectId } = req.params;
    const inspection = await Inspect.findById(inspectId);

    if (!inspection || !inspection.report || !inspection.report.filePath) {
      return res.status(404).json({ message: "Không tìm thấy biên bản kiểm tra." });
    }

    const filePath = path.join(__dirname, "..", inspection.report.filePath);

    res.download(filePath, inspection.report.fileName, (err) => {
      if (err) {
        console.error("Lỗi khi tải xuống biên bản:", err);
        res.status(500).json({ message: "Lỗi khi tải xuống biên bản." });
      }
    });
  } catch (error) {
    console.error("Lỗi khi tải xuống biên bản:", error);
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};