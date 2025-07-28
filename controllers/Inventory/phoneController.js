const Phone = require("../../models/Phone");
const path = require("path");
const fs = require("fs");
const User = require("../../models/Users");
const Room = require("../../models/Room")
const mongoose = require("mongoose");
const upload = require("../../middleware/uploadHandover"); // Middleware Multer
const redisService = require("../../services/redisService");

// Lấy danh sách phone với pagination
exports.getPhones = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Get search and filter parameters
    const { search, status, manufacturer, type, releaseYear } = req.query;
    
    console.log('🔍 [Phone] Filters received:', { search, status, manufacturer, type, releaseYear });

    // Only use cache if no filters are applied
    const hasFilters = search || status || manufacturer || type || releaseYear;
    
    if (!hasFilters) {
      // Kiểm tra cache trước
      const cachedData = await redisService.getDevicePage('phone', page, limit);
      if (cachedData) {
        console.log(`[Cache] Returning cached phones page ${page}`);
        return res.status(200).json({
          populatedPhones: cachedData.devices,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(cachedData.total / limit),
            totalItems: cachedData.total,
            itemsPerPage: limit,
            hasNext: page < Math.ceil(cachedData.total / limit),
            hasPrev: page > 1
          }
        });
      }
    }

    // Nếu không có cache, fetch từ DB
    console.log(`[DB] Fetching phones page ${page} from database`);
    
    // Build filter query
    const query = {};
    
    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { serial: { $regex: search, $options: "i" } },
        { manufacturer: { $regex: search, $options: "i" } },
        { imei1: { $regex: search, $options: "i" } },
        { imei2: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } }
      ];
    }
    
    // Add status filter
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Add manufacturer filter
    if (manufacturer && manufacturer !== 'all') {
      query.manufacturer = manufacturer;
    }
    
    // Add type filter
    if (type && type !== 'all') {
      query.type = type;
    }
    
    // Add releaseYear filter
    if (releaseYear && releaseYear !== 'all') {
      query.releaseYear = parseInt(releaseYear);
    }

    console.log('📱 [Phone] Final query:', query);

    // Get total count for pagination
    const totalItems = await Phone.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Fetch phones with population
    const populatedPhones = await Phone.find(query)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`📱 [Phone] Found ${populatedPhones.length} phones for page ${page}`);

    // Cache chỉ khi không có filter
    if (!hasFilters) {
      await redisService.cacheDevicePage('phone', page, limit, populatedPhones, totalItems);
      console.log(`[Cache] Cached phones page ${page}`);
    }

    return res.status(200).json({
      populatedPhones,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error fetching phones:", error.message);
    return res.status(500).json({
      message: "Error fetching phones",
      error: error.message,
    });
  }
};

// Thêm mới phone
exports.createPhone = async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const { 
      name, 
      manufacturer, 
      serial, 
      imei1,
      imei2,
      phoneNumber,
      assigned, 
      status, 
      specs, 
      type, 
      room, 
      reason,
      releaseYear
    } = req.body;
    const userId = req.body.userId || req.headers["user-id"];

    if (!name || !serial || !imei1) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc (name, serial, imei1)!" });
    }

    if (!specs || typeof specs !== "object") {
      return res.status(400).json({ message: "Thông tin specs không hợp lệ!" });
    }

    // Kiểm tra serial trùng
    const existingPhone = await Phone.findOne({ serial });
    if (existingPhone) {
      return res.status(400).json({
        message: `Serial "${serial}" đã tồn tại trong hệ thống.`,
      });
    }

    // Kiểm tra IMEI1 trùng
    const existingIMEI1 = await Phone.findOne({ imei1 });
    if (existingIMEI1) {
      return res.status(400).json({
        message: `IMEI1 "${imei1}" đã tồn tại trong hệ thống.`,
      });
    }

    // Kiểm tra IMEI2 trùng (nếu có)
    if (imei2) {
      const existingIMEI2 = await Phone.findOne({ imei2 });
      if (existingIMEI2) {
        return res.status(400).json({
          message: `IMEI2 "${imei2}" đã tồn tại trong hệ thống.`,
        });
      }
    }

    // Kiểm tra assigned
    if (assigned && !Array.isArray(assigned)) {
      return res
        .status(400)
        .json({ message: "Assigned phải là mảng ID người sử dụng hợp lệ." });
    }

    // Kiểm tra room nếu có
    if (room && !mongoose.Types.ObjectId.isValid(room)) {
      return res.status(400).json({ message: "Room ID không hợp lệ!" });
    }

    // Kiểm tra reason nếu status = Broken
    if (status === "Broken" && !reason) {
      return res
        .status(400)
        .json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    }

    // Tạo phone mới
    const newPhone = new Phone({
      name,
      manufacturer,
      serial,
      imei1,
      imei2,
      phoneNumber,
      releaseYear,
      assigned: assigned || [],
      status: status || "Standby",
      specs,
      type: type || "Phone",
      room: room || null,
      brokenReason: status === "Broken" ? reason : null,
    });

    // Lưu phone vào database
    const savedPhone = await newPhone.save();

    // Xóa cache khi có thiết bị mới
    await redisService.clearDeviceCache('phone');

    // Populate thông tin trước khi trả về
    const populatedPhone = await Phone.findById(savedPhone._id)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status");

    // Tạo assignment history nếu có assigned
    if (assigned && assigned.length > 0) {
      const assignmentHistory = assigned.map(userId => ({
        user: userId,
        startDate: new Date(),
        assignedBy: userId, // Có thể sử dụng req.user._id nếu có auth
        notes: "Bàn giao ban đầu",
      }));

      populatedPhone.assignmentHistory = assignmentHistory;
      await populatedPhone.save();
    }

    return res.status(201).json({
      message: "Tạo điện thoại thành công!",
      phone: populatedPhone,
    });
  } catch (error) {
    console.error("Error creating phone:", error.message);
    return res.status(500).json({
      message: "Lỗi khi tạo điện thoại",
      error: error.message,
    });
  }
};

// Cập nhật phone
exports.updatePhone = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Kiểm tra ID hợp lệ
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID điện thoại không hợp lệ!" });
    }

    // Tìm phone hiện tại
    const existingPhone = await Phone.findById(id);
    if (!existingPhone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại!" });
    }

    // Kiểm tra serial trùng (nếu thay đổi)
    if (updateData.serial && updateData.serial !== existingPhone.serial) {
      const duplicateSerial = await Phone.findOne({ 
        serial: updateData.serial, 
        _id: { $ne: id } 
      });
      if (duplicateSerial) {
        return res.status(400).json({
          message: `Serial "${updateData.serial}" đã tồn tại trong hệ thống.`,
        });
      }
    }

    // Kiểm tra IMEI1 trùng (nếu thay đổi)
    if (updateData.imei1 && updateData.imei1 !== existingPhone.imei1) {
      const duplicateIMEI1 = await Phone.findOne({ 
        imei1: updateData.imei1, 
        _id: { $ne: id } 
      });
      if (duplicateIMEI1) {
        return res.status(400).json({
          message: `IMEI1 "${updateData.imei1}" đã tồn tại trong hệ thống.`,
        });
      }
    }

    // Kiểm tra IMEI2 trùng (nếu thay đổi)
    if (updateData.imei2 && updateData.imei2 !== existingPhone.imei2) {
      const duplicateIMEI2 = await Phone.findOne({ 
        imei2: updateData.imei2, 
        _id: { $ne: id } 
      });
      if (duplicateIMEI2) {
        return res.status(400).json({
          message: `IMEI2 "${updateData.imei2}" đã tồn tại trong hệ thống.`,
        });
      }
    }

    // Cập nhật phone
    const updatedPhone = await Phone.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status");

    // Xóa cache
    await redisService.clearDeviceCache('phone');

    return res.status(200).json({
      message: "Cập nhật điện thoại thành công!",
      phone: updatedPhone,
    });
  } catch (error) {
    console.error("Error updating phone:", error.message);
    return res.status(500).json({
      message: "Lỗi khi cập nhật điện thoại",
      error: error.message,
    });
  }
};

// Xóa phone
exports.deletePhone = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra ID hợp lệ
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID điện thoại không hợp lệ!" });
    }

    // Tìm và xóa phone
    const deletedPhone = await Phone.findByIdAndDelete(id);
    if (!deletedPhone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại!" });
    }

    // Xóa cache
    await redisService.clearDeviceCache('phone');

    return res.status(200).json({
      message: "Xóa điện thoại thành công!",
      phone: deletedPhone,
    });
  } catch (error) {
    console.error("Error deleting phone:", error.message);
    return res.status(500).json({
      message: "Lỗi khi xóa điện thoại",
      error: error.message,
    });
  }
};

// Lấy thông tin chi tiết phone
exports.getPhoneById = async (req, res) => {
  const { id } = req.params;

  try {
    const phone = await Phone.findById(id)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.revokedBy", "fullname email jobTitle avatarUrl");

    if (!phone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại" });
    }

    res.status(200).json(phone);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin điện thoại:", error);
    res.status(500).json({ message: "Lỗi máy chủ", error });
  }
};

// Lấy filter options cho phone
exports.getPhoneFilterOptions = async (req, res) => {
  try {
    const manufacturers = await Phone.distinct("manufacturer");
    const types = await Phone.distinct("type");
    const yearRange = await Phone.aggregate([
      {
        $group: {
          _id: null,
          minYear: { $min: "$releaseYear" },
          maxYear: { $max: "$releaseYear" }
        }
      }
    ]);

    const currentYear = new Date().getFullYear();
    const minYear = yearRange[0]?.minYear || 2015;
    const maxYear = yearRange[0]?.maxYear || currentYear;

    res.status(200).json({
      manufacturers: manufacturers.filter(m => m),
      types: types.filter(t => t),
      yearRange: [minYear, maxYear]
    });
  } catch (error) {
    console.error("Error getting phone filter options:", error);
    res.status(500).json({
      message: "Error getting filter options",
      error: error.message
    });
  }
};

// Assign phone to user
exports.assignPhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { newUserId, notes } = req.body;
    const userId = req.headers["user-id"];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID điện thoại không hợp lệ!" });
    }

    if (!newUserId || !mongoose.Types.ObjectId.isValid(newUserId)) {
      return res.status(400).json({ message: "ID người dùng không hợp lệ!" });
    }

    // Tìm phone
    const phone = await Phone.findById(id);
    if (!phone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại!" });
    }

    // Tìm user
    const user = await User.findById(newUserId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng!" });
    }

    // Cập nhật assignment
    phone.assigned = [newUserId];
    phone.status = "Active";

    // Thêm vào assignment history
    phone.assignmentHistory.push({
      user: newUserId,
      userName: user.fullname,
      jobTitle: user.jobTitle,
      startDate: new Date(),
      assignedBy: userId,
      notes: notes || "Bàn giao điện thoại"
    });

    const updatedPhone = await phone.save();

    // Populate thông tin trước khi trả về
    const populatedPhone = await Phone.findById(updatedPhone._id)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status");

    // Xóa cache
    await redisService.clearDeviceCache('phone');

    res.status(200).json({
      message: "Bàn giao điện thoại thành công!",
      phone: populatedPhone
    });
  } catch (error) {
    console.error("Error assigning phone:", error);
    res.status(500).json({
      message: "Lỗi khi bàn giao điện thoại",
      error: error.message
    });
  }
};

// Revoke phone from user
exports.revokePhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, status = 'Standby' } = req.body;
    const userId = req.headers["user-id"];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID điện thoại không hợp lệ!" });
    }

    // Tìm phone
    const phone = await Phone.findById(id);
    if (!phone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại!" });
    }

    // Cập nhật assignment history hiện tại
    const currentAssignment = phone.assignmentHistory.find(
      history => history.user && !history.endDate
    );

    if (currentAssignment) {
      currentAssignment.endDate = new Date();
      currentAssignment.revokedBy = userId;
      currentAssignment.revokedReason = reasons;
    }

    // Cập nhật phone
    phone.assigned = [];
    phone.status = status;

    const updatedPhone = await phone.save();

    // Populate thông tin trước khi trả về
    const populatedPhone = await Phone.findById(updatedPhone._id)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status");

    // Xóa cache
    await redisService.clearDeviceCache('phone');

    res.status(200).json({
      message: "Thu hồi điện thoại thành công!",
      phone: populatedPhone
    });
  } catch (error) {
    console.error("Error revoking phone:", error);
    res.status(500).json({
      message: "Lỗi khi thu hồi điện thoại",
      error: error.message
    });
  }
};

// Update phone status
exports.updatePhoneStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID điện thoại không hợp lệ!" });
    }

    const updateData = { status };
    if (status === "Broken") {
      if (!brokenReason) {
        return res.status(400).json({ 
          message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" 
        });
      }
      updateData.brokenReason = brokenReason;
    } else {
      updateData.brokenReason = null;
    }

    const updatedPhone = await Phone.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status");

    if (!updatedPhone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại!" });
    }

    // Xóa cache
    await redisService.clearDeviceCache('phone');

    res.status(200).json({
      message: "Cập nhật trạng thái điện thoại thành công!",
      phone: updatedPhone
    });
  } catch (error) {
    console.error("Error updating phone status:", error);
    res.status(500).json({
      message: "Lỗi khi cập nhật trạng thái điện thoại",
      error: error.message
    });
  }
};

// Update phone specs
exports.updatePhoneSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID điện thoại không hợp lệ!" });
    }

    if (!specs || typeof specs !== "object") {
      return res.status(400).json({ message: "Thông tin specs không hợp lệ!" });
    }

    const updatedPhone = await Phone.findByIdAndUpdate(
      id,
      { specs },
      { new: true }
    )
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status");

    if (!updatedPhone) {
      return res.status(404).json({ message: "Không tìm thấy điện thoại!" });
    }

    // Xóa cache
    await redisService.clearDeviceCache('phone');

    res.status(200).json({
      message: "Cập nhật thông số điện thoại thành công!",
      phone: updatedPhone
    });
  } catch (error) {
    console.error("Error updating phone specs:", error);
    res.status(500).json({
      message: "Lỗi khi cập nhật thông số điện thoại",
      error: error.message
    });
  }
}; 