const Projector = require("../../models/Projector");
const path = require("path");
const fs = require("fs");
const User = require("../../models/Users");
const Room = require("../../models/Room")
const mongoose = require("mongoose");
const upload = require("../../middleware/uploadHandover"); // Middleware Multer
const redisService = require("../../services/redisService");


// Lấy danh sách projector với pagination
exports.getProjectors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Kiểm tra cache trước
    const cachedData = await redisService.getDevicePage('projector', page, limit);
    if (cachedData) {
      console.log(`[Cache] Returning cached projectors page ${page}`);
      return res.status(200).json({
        populatedProjectors: cachedData.devices,
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

    // Nếu không có cache, fetch từ DB
    console.log(`[DB] Fetching projectors page ${page} from database`);
    
    // Đếm tổng số documents
    const totalItems = await Projector.countDocuments();
    
    // Lấy data với pagination
    const projectors = await Projector.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("assigned", "fullname jobTitle department avatarUrl")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email title")
      .populate("assignmentHistory.revokedBy", "fullname email")
      .lean();

    // Reshape data như cũ
    const populatedProjectors = projectors.map((projector) => ({
      ...projector,
      room: projector.room
        ? {
            ...projector.room,
            location:
              projector.room.location?.map(
                (loc) => `${loc.building}, tầng ${loc.floor}`
              ) || ["Không xác định"],
          }
        : { name: "Không xác định", location: ["Không xác định"] },
    }));

    // Lưu vào cache (5 phút)
    await redisService.setDevicePage('projector', page, limit, populatedProjectors, totalItems, 300);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      populatedProjectors,
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
    console.error("Error fetching projectors:", error.message);
    return res.status(500).json({
      message: "Error fetching projectors",
      error: error.message,
    });
  }
};

// Thêm mới projector
exports.createProjector = async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const { 
      name, 
      manufacturer, 
      serial, 
      assigned, 
      status, 
      specs, 
      type, 
      room, 
      reason 
    } = req.body;
    const userId = req.body.userId || req.headers["user-id"];

    if (!name || !serial) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc (name, serial)!" });
    }

    if (!specs || typeof specs !== "object") {
      return res.status(400).json({ message: "Thông tin specs không hợp lệ!" });
    }

    // Kiểm tra serial trùng
    const existingProjector = await Projector.findOne({ serial });
    if (existingProjector) {
      return res.status(400).json({
        message: `Serial "${serial}" đã tồn tại trong hệ thống.`,
      });
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

    // Nếu status không hợp lệ, gán mặc định "Standby"
    let validStatus = status;
    if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(status)) {
      validStatus = "Standby";
    }

    // *** ĐIỂM THÊM MỚI *** 
    // Nếu đã có assigned mà status vẫn = Standby => ép về PendingDocumentation
    if (assigned && assigned.length > 0 && validStatus === "Standby") {
      validStatus = "PendingDocumentation";
    }

    const projector = new Projector({
      name,
      manufacturer,
      serial,
      assigned,
      specs,
      type,
      room,
      reason: validStatus === "Broken" ? reason : undefined,
      status: validStatus,
    });

    await projector.save();
    
    // Xóa cache do có dữ liệu mới
    await redisService.deleteDeviceCache('projector');
    
    res.status(201).json(projector);
  } catch (error) {
    console.error("Error creating projector:", error.message);
    res.status(500).json({ message: "Lỗi khi thêm projector", error: error.message });
  }
};

exports.updateProjector = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      manufacturer,
      serial,
      assigned,
      status,
      releaseYear,
      specs,
      type,
      room,
      reason,
    } = req.body;

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

    // Nếu status gửi lên không hợp lệ => giữ nguyên projector cũ (tránh set bậy)
    let validStatus = status;
    if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(status)) {
      // Tìm projector cũ để lấy lại status
      const oldProjector = await Projector.findById(id).lean();
      if (!oldProjector) {
        return res.status(404).json({ message: "Không tìm thấy projector." });
      }
      validStatus = oldProjector.status;
    }

    // Nếu state = Broken => cần reason
    if (validStatus === "Broken" && !reason) {
      return res.status(400).json({
        message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!",
      });
    }

    // *** ĐIỂM THÊM MỚI ***
    // Nếu đã có assigned mà validStatus vẫn = Standby => ép về PendingDocumentation
    if (assigned && assigned.length > 0 && validStatus === "Standby") {
      validStatus = "PendingDocumentation";
    }

    const updatedData = {
      name,
      manufacturer,
      serial,
      assigned,
      status: validStatus,
      releaseYear,
      specs,
      type,
      room,
      reason: validStatus === "Broken" ? reason : undefined,
    };

    const projector = await Projector.findByIdAndUpdate(id, updatedData, { new: true });

    if (!projector) {
      return res.status(404).json({ message: "Không tìm thấy projector" });
    }

    res.json(projector);
  } catch (error) {
    console.error("Error updating projector:", error.message);
    res
      .status(400)
      .json({ message: "Error updating projector", error: error.message });
  }
};

// Xóa projector
exports.deleteProjector = async (req, res) => {
  try {
    await Projector.findByIdAndDelete(req.params.id);
    res.json({ message: "Projector deleted" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting projector", error });
  }
};

// Thêm / Sửa ở projectorController.js
exports.bulkUploadProjectors = async (req, res) => {
  try {
    const { projectors } = req.body;
    console.log("Projectors:", projectors);
    if (!projectors || !Array.isArray(projectors) || projectors.length === 0) {
      return res
        .status(400)
        .json({ message: "Không có dữ liệu hợp lệ để tải lên!" });
    }

    const errors = [];
    const validProjectors = [];

    for (const projector of projectors) {
      try {
        // Kiểm tra room, gán null nếu không hợp lệ
        projector.room =
          projector.room && mongoose.Types.ObjectId.isValid(projector.room)
            ? projector.room
            : null;

        // Kiểm tra status. Nếu không thuộc các trạng thái dưới => ép về Standby
        if (
          !["Active", "Standby", "Broken", "PendingDocumentation"].includes(
            projector.status
          )
        ) {
          projector.status = "Standby";
        }

        // Kiểm tra assigned
        if (projector.assigned && Array.isArray(projector.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(projector.assigned[0]);
          if (isId) {
            // Nếu assigned là mảng ID => kiểm tra user có tồn tại
            const validIds = await User.find({
              _id: { $in: projector.assigned },
            }).select("_id");
            if (validIds.length !== projector.assigned.length) {
              throw new Error("Một số ID người dùng không tồn tại trong hệ thống.");
            }
          } else {
            // Nếu assigned là mảng fullname => convert sang ID
            const assignedIds = await Promise.all(
              projector.assigned.map(async (fullname) => {
                const user = await User.findOne({
                  fullname: fullname.trim(),
                }).select("_id");
                if (!user) {
                  throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                }
                return user._id;
              })
            );
            projector.assigned = assignedIds;
          }
        }

        // Nếu projector.assigned có user => ép status sang PendingDocumentation nếu đang Standby
        if (
          projector.assigned &&
          projector.assigned.length > 0 &&
          projector.status === "Standby"
        ) {
          projector.status = "PendingDocumentation";
        }

        // Kiểm tra room
        if (projector.room && !mongoose.Types.ObjectId.isValid(projector.room)) {
          throw new Error(`Room ID "${projector.room}" không hợp lệ.`);
        }

        // Kiểm tra name, serial
        if (!projector.name || !projector.serial) {
          errors.push({
            serial: projector.serial || "Không xác định",
            message: "Thông tin projector không hợp lệ (thiếu tên, serial).",
          });
          continue;
        }

        // Kiểm tra trùng serial
        const existingProjector = await Projector.findOne({ serial: projector.serial });
        if (existingProjector) {
          errors.push({
            serial: projector.serial,
            name: projector.name,
            message: `Serial ${projector.serial} đã tồn tại.`,
          });
          continue;
        }

        validProjectors.push(projector);
      } catch (error) {
        errors.push({
          serial: projector.serial || "Không xác định",
          message: error.message || "Lỗi không xác định khi xử lý projector.",
        });
      }
    }

    // Nếu có projector hợp lệ, ghi vào DB
    if (validProjectors.length > 0) {
      await Projector.insertMany(validProjectors);
    }

    res.status(201).json({
      message: "Thêm mới hàng loạt thành công!",
      addedProjectors: validProjectors.length,
      errors,
    });
  } catch (error) {
    console.error("Lỗi khi thêm mới hàng loạt:", error.message);
    res
      .status(500)
      .json({ message: "Lỗi khi thêm mới hàng loạt", error: error.message });
  }
};

// controllers/projectorController.js
// Thêm / Sửa ở projectorController.js
exports.assignProjector = async (req, res) => {
  try {
    const { id } = req.params; // projectorId
    const { newUserId, notes } = req.body;

    const projector = await Projector.findById(id).populate("assigned");
    if (!projector) {
      return res.status(404).json({ message: "Không tìm thấy projector" });
    }

    // Đóng hết các assignmentHistory cũ
    projector.assignmentHistory.forEach((entry) => {
      if (!entry.endDate) {
        entry.endDate = new Date();
      }
    });

    const currentUser = req.user; // Lấy thông tin người đang đăng nhập (nếu có middleware auth)

    // Nếu projector đã có assigned => đóng bản ghi cũ
    if (projector.assigned?.length > 0) {
      const oldUserId = projector.assigned[0]._id;
      const lastHistory = projector.assignmentHistory.find(
        (h) => h.user.toString() === oldUserId.toString() && !h.endDate
      );
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser?._id || null; // Lưu người thu hồi
      }
    }

    // Tìm user mới
    const newUser = await User.findById(newUserId);
    if (!newUser) {
      return res.status(404).json({ message: "Không tìm thấy user mới" });
    }

    // Thêm record vào assignmentHistory
    projector.assignmentHistory.push({
      user: newUser._id,
      userName: newUser.fullname,
      startDate: new Date(),
      notes: notes || "",
      assignedBy: currentUser?.id || null,
      jobTitle: newUser.jobTitle || "Không xác định",
    });

    // Cập nhật currentHolder
    projector.currentHolder = {
      id: newUser._id,
      fullname: newUser.fullname,
      jobTitle: newUser.jobTitle,
      department: newUser.department,
      avatarUrl: newUser.avatarUrl,
    };

    // Cập nhật assigned
    projector.assigned = [newUser._id];

    // *** THIẾT LẬP TRẠNG THÁI *** 
    // Mặc định khi bàn giao: PendingDocumentation (nếu chưa có biên bản)
    projector.status = "PendingDocumentation";

    await projector.save();

    // Populate assignmentHistory.user để trả về thông tin chi tiết
    const populatedProjector = await projector.populate({
      path: "assignmentHistory.user",
      select: "fullname jobTitle avatarUrl department",
    });

    res.status(200).json(populatedProjector);
  } catch (error) {
    console.error("Lỗi assignProjector:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

// controllers/projectorController.js
exports.revokeProjector = async (req, res) => {
  try {
    const { id } = req.params;
    const { revokedBy, reasons, status } = req.body;

    const projector = await Projector.findById(id).populate("assigned");
    if (!projector) {
      return res.status(404).json({ message: "Projector không tồn tại" });
    }

    const currentUser = req.user; // Người thực hiện thu hồi

    if (projector.assigned.length > 0) {
      const oldUserId = projector.assigned[0]._id;
      const lastHistory = projector.assignmentHistory.find(
        (hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate
      );
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser.id; // Ghi lại người thu hồi
        lastHistory.revokedReason = reasons; // Ghi lý do thu hồi vào bản ghi hiện tại
      }
    } else {
      // Nếu không có bản ghi nào đang mở, thêm một bản ghi mới
      projector.assignmentHistory.push({
        revokedBy,
        revokedReason: reasons,
        endDate: new Date(),
      });
    }

    // Cập nhật trạng thái thiết bị
    projector.status = status || "Standby"; // Hoặc trạng thái bạn mong muốn
    projector.currentHolder = null; // Xóa người đang giữ projector
    projector.assigned = [];
    await projector.save();

    res.status(200).json({ message: "Thu hồi thành công", projector });
  } catch (error) {
    console.error("Lỗi revokeProjector:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

exports.updateProjectorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason } = req.body;

      if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(status)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      if (status === "Broken" && !brokenReason) {
        return res.status(400).json({ error: "Lý do báo hỏng là bắt buộc!" });
      }    

      try {
        const projector = await Projector.findById(id);
        if (!projector) {
          return res.status(404).json({ message: "Không tìm thấy thiết bị" });
        }
    
        // Lưu lý do báo hỏng vào `reason`
        if (status === "Broken") {
          projector.brokenReason = brokenReason || "Không xác định";
        }
    
        projector.status = status;
        await projector.save();
    
        res.status(200).json(projector);
      } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái:", error);
        res.status(500).json({ message: "Lỗi máy chủ", error });
      }
  } catch (error) {
    console.error("Lỗi updateProjectorStatus:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

exports.searchProjectors = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Từ khóa tìm kiếm không hợp lệ!" });
    }

    // Tìm kiếm theo Tên thiết bị, Serial và Người sử dụng
    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: "i" } }, // Tìm theo tên thiết bị
        { serial: { $regex: query, $options: "i" } }, // Tìm theo serial
        {
          "assigned.fullname": { $regex: query, $options: "i" }, // Tìm theo tên người sử dụng
        },
      ],
    };

    const projectors = await Projector.find(searchQuery)
      .populate("assigned", "fullname jobTitle department avatarUrl")
      .populate("room", "name location status")
      .lean(); // Trả về object thường

    res.status(200).json(projectors);
  } catch (error) {
    console.error("Error during search:", error.message);
    res.status(500).json({ message: "Lỗi khi tìm kiếm projectors", error: error.message });
  }
};

const sanitizeFileName = (originalName) => {
  // Ví dụ function remove dấu + thay space -> '_'
  let temp = originalName.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // bỏ dấu
  temp = temp.replace(/\s+/g, "_"); // chuyển dấu cách -> _
  // Loại bỏ ký tự đặc biệt... v.v. tuỳ ý
  return temp;
};

exports.uploadHandoverReport = async (req, res) => {
  console.log("📤 Dữ liệu nhận được từ frontend:", req.body);
  try {
    const { projectorId, userId, username } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "File không được tải lên." });
    }

    console.log("✅ Trong Controller - username nhận được:", username);

     const originalFileName = path.basename(req.file.path); 
    // => "BBBG-Nguyễn Hải Linh-2025-03-10.pdf"

    // sanitize
    const sanitizedName = sanitizeFileName(originalFileName);
    // => "BBBG-Nguyen_Hai_Linh-2025-03-10.pdf"

    // Đổi tên file trên ổ cứng 
    const oldPath = path.join(__dirname, "../uploads/Handovers", originalFileName);
    const newPath = path.join(__dirname, "../uploads/Handovers", sanitizedName);
    fs.renameSync(oldPath, newPath);

    const projector = await Projector.findById(projectorId);
    if (!projector) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị." });
    }

    console.log("✅ Tìm thấy projector:", projector);

    let currentAssignment = projector.assignmentHistory.find(
      (history) => 
        history.user && 
        history.user.toString() === userId && 
        !history.endDate
    );

    if (!currentAssignment) {
      console.warn("⚠️ Không tìm thấy lịch sử bàn giao hợp lệ. Tạo bản ghi mới...");
      projector.assignmentHistory.push({
        user: new mongoose.Types.ObjectId(userId),
        startDate: new Date(),
        document: originalFileName,
      });

      currentAssignment = projector.assignmentHistory[projector.assignmentHistory.length - 1];
    } else {
      console.log("🔄 Cập nhật lịch sử bàn giao hiện tại.");
      currentAssignment.document = sanitizedName;
    }

    projector.status = "Active";
    await projector.save();

    return res.status(200).json({
      message: "Tải lên biên bản thành công!",
      projector,
    });
  } catch (error) {
    console.error("❌ Lỗi khi tải lên biên bản:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi server." });
  }
};

// Endpoint để trả file PDF
exports.getHandoverReport = async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "../uploads/Handovers", filename);

  // Kiểm tra file có tồn tại không
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Không tìm thấy file." });
  }

  // Gửi file PDF
  res.sendFile(filePath);
};

// Lấy thông tin chi tiết projector
exports.getProjectorById = async (req, res) => {
  const { id } = req.params;

  try {
    const projector = await Projector.findById(id)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.revokedBy", "fullname email jobTitle avatarUrl");

    if (!projector) {
      return res.status(404).json({ message: "Không tìm thấy projector" });
    }

    res.status(200).json(projector);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin projector:", error);
    res.status(500).json({ message: "Lỗi máy chủ", error });
  }
};

// Cập nhật thông tin specs của projector
exports.updateProjectorSpecs = async (req, res) => {
  try {
    console.log("Payload nhận được từ frontend:", req.body);

    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;

    // Lấy projector hiện tại từ DB
    const currentProjector = await Projector.findById(id);
    if (!currentProjector) {
      return res.status(404).json({ message: "Projector không tồn tại." });
    }

    // Làm sạch dữ liệu specs
    const cleanedSpecs = {
      processor: specs.processor ?? currentProjector.specs.processor,
      ram: specs.ram ?? currentProjector.specs.ram,
      storage: specs.storage ?? currentProjector.specs.storage,
      display: specs.display ?? currentProjector.specs.display,
    };

    // Cập nhật payload
    const updates = {
      specs: cleanedSpecs,
      releaseYear: releaseYear ?? currentProjector.releaseYear,
      manufacturer: manufacturer ?? currentProjector.manufacturer,
      type: type ?? currentProjector.type,
    };

    console.log("Payload để cập nhật (sau khi làm sạch):", updates);

    const updatedProjector = await Projector.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedProjector) {
      return res.status(404).json({ message: "Không thể cập nhật projector." });
    }

    console.log("Projector sau khi cập nhật:", updatedProjector);
    res.status(200).json(updatedProjector);
  } catch (error) {
    console.error("Lỗi khi cập nhật specs:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Thêm hàm này trong projectorController.js
exports.fixOldData = async (req, res) => {
  try {
    // Lấy tất cả projector
    const allProjectors = await Projector.find()
      .populate("assigned")
      .populate("assignmentHistory.user");

    let updatedCount = 0;

    for (const projector of allProjectors) {
      let needSave = false;

      // 1) Nếu projector có assigned (≠ rỗng)
      if (projector.assigned && projector.assigned.length > 0) {
        // Lấy user cuối (nếu mảng assigned > 1, coi user cuối cùng là người đang giữ)
        const lastUser = projector.assigned[projector.assigned.length - 1];

        // Tìm trong assignmentHistory record chưa có endDate, ứng với lastUser
        let openRecord = projector.assignmentHistory.find(
          (h) => !h.endDate && h.user?.toString() === lastUser._id.toString()
        );

        // Nếu chưa có record, tạo mới
        if (!openRecord) {
          projector.assignmentHistory.forEach((h) => {
            // Đóng các record cũ không có endDate (chặn xung đột)
            if (!h.endDate) {
              h.endDate = new Date();
            }
          });

          openRecord = {
            user: lastUser._id,
            userName: lastUser.fullname,
            startDate: new Date(), // thời điểm fix
            document: "", // Chưa có biên bản
          };
          projector.assignmentHistory.push(openRecord);
          needSave = true;
        }

        // Xét xem record đó có document hay chưa
        if (!openRecord.document) {
          // Thiếu biên bản => “PendingDocumentation”
          if (projector.status !== "PendingDocumentation") {
            projector.status = "PendingDocumentation";
            needSave = true;
          }
        } else {
          // Có document => “Active”
          if (projector.status !== "Active") {
            projector.status = "Active";
            needSave = true;
          }
        }

        // Cập nhật currentHolder
        if (
          !projector.currentHolder ||
          projector.currentHolder.id?.toString() !== lastUser._id.toString()
        ) {
          projector.currentHolder = {
            id: lastUser._id,
            fullname: lastUser.fullname || "Không xác định",
            jobTitle: lastUser.jobTitle || "",
            department: lastUser.department || "",
            avatarUrl: lastUser.avatarUrl || "",
          };
          needSave = true;
        }
      } else {
        // 2) Nếu projector không có assigned => về Standby
        // Nhưng có thể còn record cũ chưa đóng => đóng hết
        let openRecords = projector.assignmentHistory.filter(
          (h) => !h.endDate
        );
        if (openRecords.length > 0) {
          for (let record of openRecords) {
            record.endDate = new Date();
          }
          needSave = true;
        }

        // Nếu status != Standby, ta ép về Standby (tuỳ nghiệp vụ)
        if (projector.status !== "Standby") {
          projector.status = "Standby";
          needSave = true;
        }

        // Xoá currentHolder
        if (projector.currentHolder) {
          projector.currentHolder = null;
          needSave = true;
        }
      }

      // 3) Lưu nếu có thay đổi
      if (needSave) {
        await projector.save();
        updatedCount++;
      }
    }

    res.json({
      message: "Hoàn thành chuẩn hoá dữ liệu cũ.",
      totalProjectors: allProjectors.length,
      updatedCount,
    });
  } catch (error) {
    console.error("Lỗi fixOldData:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi chuẩn hoá.", error });
  }
};

// Get filter options for projectors
exports.getProjectorFilterOptions = async (req, res) => {
  try {
    console.log('[Filter Options] Fetching projector filter options');
    
    // Aggregate data from all projectors
    const aggregationPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'assigned',
          foreignField: '_id',
          as: 'assignedUsers'
        }
      },
      {
        $group: {
          _id: null,
          statuses: { $addToSet: '$status' },
          types: { $addToSet: '$type' },
          manufacturers: { $addToSet: '$manufacturer' },
          departments: { $addToSet: '$assignedUsers.department' },
          years: { $addToSet: '$releaseYear' }
        }
      }
    ];

    const result = await Projector.aggregate(aggregationPipeline);
    
    if (!result || result.length === 0) {
      return res.status(200).json({
        statuses: ['Active', 'Standby', 'Broken', 'PendingDocumentation'],
        types: [],
        manufacturers: [],
        departments: [],
        yearRange: [2015, new Date().getFullYear()]
      });
    }

    const data = result[0];
    
    // Clean and filter data
    const statuses = (data.statuses || []).filter(Boolean);
    const types = (data.types || []).filter(Boolean);
    const manufacturers = (data.manufacturers || []).filter(Boolean).sort();
    const departments = data.departments ? 
      [].concat(...data.departments).filter(Boolean).filter((dept, index, arr) => arr.indexOf(dept) === index).sort() : [];
    const years = (data.years || []).filter(year => year && year > 1990);
    
    const yearRange = years.length > 0 ? 
      [Math.min(...years), Math.max(...years)] : 
      [2015, new Date().getFullYear()];

    const filterOptions = {
      statuses,
      types,
      manufacturers,
      departments,
      yearRange
    };

    console.log('[Filter Options] Returning:', filterOptions);
    
    res.status(200).json(filterOptions);
  } catch (error) {
    console.error('Error fetching projector filter options:', error);
    res.status(500).json({
      message: 'Error fetching filter options',
      error: error.message,
      statuses: ['Active', 'Standby', 'Broken', 'PendingDocumentation'],
      types: [],
      manufacturers: [],
      departments: [],
      yearRange: [2015, new Date().getFullYear()]
    });
  }
};