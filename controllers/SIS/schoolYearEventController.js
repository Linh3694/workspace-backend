const mongoose = require("mongoose");
const SchoolYearEvent = require("../../models/SchoolYearEvent");
const SchoolYear = require("../../models/SchoolYear");

// Tạo sự kiện năm học mới
exports.createSchoolYearEvent = async (req, res) => {
  try {
    const { name, startDate, endDate, description, type, schoolYear } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!name || !startDate || !endDate || !type || !schoolYear) {
      return res.status(400).json({ message: "Name, startDate, endDate, type, and schoolYear are required" });
    }

    // Kiểm tra năm học có tồn tại không
    const schoolYearExists = await SchoolYear.findById(schoolYear);
    if (!schoolYearExists) {
      return res.status(400).json({ message: "School year not found" });
    }

    // Kiểm tra logic thời gian
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ message: "Start date must be before or equal to end date" });
    }

    // Kiểm tra sự kiện có nằm trong năm học không
    const schoolYearStart = new Date(schoolYearExists.startDate);
    const schoolYearEnd = new Date(schoolYearExists.endDate);
    const eventStart = new Date(startDate);
    const eventEnd = new Date(endDate);

    if (eventStart < schoolYearStart || eventEnd > schoolYearEnd) {
      return res.status(400).json({ message: "Event must be within the school year period" });
    }

    const newEvent = await SchoolYearEvent.create({
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      description,
      type,
      schoolYear,
    });

    return res.status(201).json(newEvent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy tất cả sự kiện năm học
exports.getAllSchoolYearEvents = async (req, res) => {
  try {
    const { schoolYear } = req.query;
    const query = schoolYear ? { schoolYear } : {};

    const events = await SchoolYearEvent.find(query)
      .populate("schoolYear", "code startDate endDate")
      .sort({ startDate: 1 });

    return res.json({ data: events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy sự kiện theo ID
exports.getSchoolYearEventById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const event = await SchoolYearEvent.findById(id)
      .populate("schoolYear", "code startDate endDate");

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.json(event);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Cập nhật sự kiện năm học
exports.updateSchoolYearEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, description, type, schoolYear } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    // Kiểm tra logic thời gian
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ message: "Start date must be before or equal to end date" });
    }

    // Nếu thay đổi năm học, kiểm tra năm học mới có tồn tại không
    if (schoolYear) {
      const schoolYearExists = await SchoolYear.findById(schoolYear);
      if (!schoolYearExists) {
        return res.status(400).json({ message: "School year not found" });
      }

      // Kiểm tra sự kiện có nằm trong năm học mới không
      const schoolYearStart = new Date(schoolYearExists.startDate);
      const schoolYearEnd = new Date(schoolYearExists.endDate);
      const eventStart = startDate ? new Date(startDate) : new Date();
      const eventEnd = endDate ? new Date(endDate) : new Date();

      if (eventStart < schoolYearStart || eventEnd > schoolYearEnd) {
        return res.status(400).json({ message: "Event must be within the school year period" });
      }
    }

    const updatedEvent = await SchoolYearEvent.findByIdAndUpdate(
      id,
      {
        name,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        description,
        type,
        schoolYear,
        updatedAt: Date.now(),
      },
      { new: true, omitUndefined: true }
    ).populate("schoolYear", "code startDate endDate");

    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.json(updatedEvent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Xóa sự kiện năm học
exports.deleteSchoolYearEvent = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const deletedEvent = await SchoolYearEvent.findByIdAndDelete(id);
    if (!deletedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.json({ message: "Event deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy sự kiện theo năm học
exports.getEventsBySchoolYear = async (req, res) => {
  try {
    const { schoolYearId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(schoolYearId)) {
      return res.status(400).json({ message: "Invalid school year ID" });
    }

    const events = await SchoolYearEvent.find({ schoolYear: schoolYearId })
      .populate("schoolYear", "code startDate endDate")
      .sort({ startDate: 1 });

    return res.json({ data: events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy sự kiện theo loại
exports.getEventsByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { schoolYear } = req.query;

    const query = { type };
    if (schoolYear) {
      query.schoolYear = schoolYear;
    }

    const events = await SchoolYearEvent.find(query)
      .populate("schoolYear", "code startDate endDate")
      .sort({ startDate: 1 });

    return res.json({ data: events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy sự kiện theo tháng
exports.getEventsByMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { schoolYear } = req.query;

    const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

    const query = {
      $or: [
        { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
        { endDate: { $gte: startOfMonth, $lte: endOfMonth } },
        { startDate: { $lte: startOfMonth }, endDate: { $gte: endOfMonth } }
      ]
    };

    if (schoolYear) {
      query.schoolYear = schoolYear;
    }

    const events = await SchoolYearEvent.find(query)
      .populate("schoolYear", "code startDate endDate")
      .sort({ startDate: 1 });

    return res.json({ data: events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createSchoolYearEvent: exports.createSchoolYearEvent,
  getAllSchoolYearEvents: exports.getAllSchoolYearEvents,
  getSchoolYearEventById: exports.getSchoolYearEventById,
  updateSchoolYearEvent: exports.updateSchoolYearEvent,
  deleteSchoolYearEvent: exports.deleteSchoolYearEvent,
  getEventsBySchoolYear: exports.getEventsBySchoolYear,
  getEventsByType: exports.getEventsByType,
  getEventsByMonth: exports.getEventsByMonth
}; 