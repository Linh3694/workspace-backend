const Monitor = require("../../models/Monitor");
const User = require("../../models/Users");
const Room = require("../../models/Room");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Lấy danh sách monitor
exports.getMonitors = async (req, res) => {
  try {
    const monitors = await Monitor.find()
      .sort({ createdAt: -1 })
      .populate("assigned", "fullname jobTitle department avatarUrl")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email title")
      .populate("assignmentHistory.revokedBy", "fullname email")
      .lean();

    const populatedMonitors = monitors.map((monitor) => ({
      ...monitor,
      room: monitor.room
        ? {
            ...monitor.room,
            location:
              monitor.room.location?.map(
                (loc) => `${loc.building}, tầng ${loc.floor}`
              ) || ["Không xác định"],
          }
        : { name: "Không xác định", location: ["Không xác định"] },
    }));

    return res.status(200).json({
      populatedMonitors,
    });
  } catch (error) {
    console.error("Error fetching monitors:", error.message);
    return res.status(500).json({
      message: "Error fetching monitors",
      error: error.message,
    });
  }
};

// Lấy thông tin chi tiết của 1 monitor
exports.getMonitorById = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  console.log("Payload nhận được từ client:", updateData);
  try {
    const monitor = await Monitor.findById(id)
      .populate("assigned", "fullname email jobTitle avatarUrl")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.revokedBy", "fullname email jobTitle avatarUrl");

    if (!monitor) {
      return res.status(404).send({ message: "Không tìm thấy monitor" });
    }
    res.status(200).json(monitor);
  } catch (error) {
    res.status(500).send({ message: "Lỗi máy chủ", error });
  }
};

// Thêm mới monitor
exports.createMonitor = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { name, manufacturer, serial, assigned, status, room, reason } = req.body;
    const userId = req.body.userId || req.headers["user-id"];

    if (!name || !serial) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
    }

    const existingMonitor = await Monitor.findOne({ serial });
    if (existingMonitor) {
      return res.status(400).json({ message: `Serial "${serial}" đã tồn tại trong hệ thống.` });
    }

    if (assigned && !Array.isArray(assigned)) {
      return res.status(400).json({ message: "Assigned phải là mảng ID người sử dụng hợp lệ." });
    }

    if (room && !mongoose.Types.ObjectId.isValid(room)) {
      return res.status(400).json({ message: "Room ID không hợp lệ!" });
    }

    if (status === "Broken" && !reason) {
      return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    }

    const monitor = new Monitor({
      name,
      manufacturer,
      serial,
      assigned,
      status,
      room,
      reason: status === "Broken" ? reason : undefined,
    });

    await monitor.save();
    res.status(201).json(monitor);
  } catch (error) {
    console.error("Error creating monitor:", error.message);
    res.status(500).json({ message: "Lỗi khi thêm monitor", error: error.message });
  }
};

// Cập nhật monitor
exports.updateMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, room, reason } = req.body;

    if (assigned && !Array.isArray(assigned)) {
      return res.status(400).json({ message: "Assigned phải là mảng ID người sử dụng hợp lệ." });
    }

    if (room && !mongoose.Types.ObjectId.isValid(room)) {
      return res.status(400).json({ message: "Room ID không hợp lệ!" });
    }

    const monitor = await Monitor.findByIdAndUpdate(
      id,
      {
        name,
        manufacturer,
        serial,
        assigned,
        status,
        releaseYear,
        room,
        reason: status === "Broken" ? reason : undefined,
      },
      { new: true }
    );

    if (!monitor) {
      return res.status(404).json({ message: "Không tìm thấy monitor" });
    }
    res.json(monitor);
  } catch (error) {
    console.error("Error updating monitor:", error.message);
    res.status(400).json({ message: "Error updating monitor", error: error.message });
  }
};

// Xóa monitor
exports.deleteMonitor = async (req, res) => {
  try {
    await Monitor.findByIdAndDelete(req.params.id);
    res.json({ message: "Monitor deleted" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting monitor", error });
  }
};

// Cập nhật thông tin specs của monitor
exports.updateMonitorSpecs = async (req, res) => {
  try {
    console.log("Payload nhận được từ frontend:", req.body);
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;

    const currentMonitor = await Monitor.findById(id);
    if (!currentMonitor) {
      return res.status(404).json({ message: "Monitor không tồn tại." });
    }

    const cleanedSpecs = {
      display: specs.display ?? currentMonitor.specs.display,
    };

    const updates = {
      specs: cleanedSpecs,
      releaseYear: releaseYear ?? currentMonitor.releaseYear,
      manufacturer: manufacturer ?? currentMonitor.manufacturer,
      type: type ?? currentMonitor.type,
    };

    console.log("Payload để cập nhật (sau khi làm sạch):", updates);
    const updatedMonitor = await Monitor.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedMonitor) {
      return res.status(404).json({ message: "Không thể cập nhật monitor." });
    }
    console.log("Monitor sau khi cập nhật:", updatedMonitor);
    res.status(200).json(updatedMonitor);
  } catch (error) {
    console.error("Lỗi khi cập nhật specs:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Tải lên hàng loạt monitor
exports.bulkUploadMonitors = async (req, res) => {
  try {
    const { monitors } = req.body;
    console.log("Monitors:", monitors);
    if (!monitors || !Array.isArray(monitors) || monitors.length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu hợp lệ để tải lên!" });
    }

    const errors = [];
    const validMonitors = [];

    for (const monitor of monitors) {
      try {
        monitor.room = monitor.room && mongoose.Types.ObjectId.isValid(monitor.room) ? monitor.room : null;
        monitor.status = ["Active", "Standby", "Broken", "PendingDocumentation"].includes(monitor.status)
          ? monitor.status
          : "Standby";
        if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(monitor.status)) {
          console.warn(`Status không hợp lệ: ${monitor.status}. Thiết lập giá trị 'Standby'.`);
          monitor.status = "Standby";
        }
        if (monitor.assigned && Array.isArray(monitor.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(monitor.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: monitor.assigned } }).select("_id");
            if (validIds.length !== monitor.assigned.length) {
              throw new Error("Một số ID người dùng không tồn tại trong hệ thống.");
            }
          } else {
            const assignedIds = await Promise.all(
              monitor.assigned.map(async (fullname) => {
                const user = await User.findOne({ fullname: fullname.trim() }).select("_id");
                if (!user) {
                  throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                }
                return user._id;
              })
            );
            monitor.assigned = assignedIds;
          }
        }
        if (monitor.room && !mongoose.Types.ObjectId.isValid(monitor.room)) {
          throw new Error(`Room ID "${monitor.room}" không hợp lệ.`);
        }
        if (!monitor.name || !monitor.serial) {
          errors.push({
            serial: monitor.serial || "Không xác định",
            message: "Thông tin monitor không hợp lệ (thiếu tên, serial).",
          });
          continue;
        }
        const existingMonitor = await Monitor.findOne({ serial: monitor.serial });
        if (existingMonitor) {
          errors.push({
            serial: monitor.serial,
            name: monitor.name,
            message: `Serial ${monitor.serial} đã tồn tại.`,
          });
          continue;
        }
        validMonitors.push(monitor);
      } catch (error) {
        errors.push({
          serial: monitor.serial || "Không xác định",
          message: error.message || "Lỗi không xác định khi xử lý monitor.",
        });
      }
    }

    if (validMonitors.length > 0) {
      await Monitor.insertMany(validMonitors);
    }

    res.status(201).json({
      message: "Thêm mới hàng loạt thành công!",
      addedMonitors: validMonitors.length,
      errors,
    });
  } catch (error) {
    console.error("Lỗi khi thêm mới hàng loạt:", error.message);
    res.status(500).json({ message: "Lỗi khi thêm mới hàng loạt", error: error.message });
  }
};

// Bàn giao monitor
exports.assignMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { newUserId, notes } = req.body;

    const monitor = await Monitor.findById(id).populate("assigned");
    if (!monitor) {
      return res.status(404).json({ message: "Không tìm thấy monitor" });
    }

    monitor.assignmentHistory.forEach((entry) => {
      if (!entry.endDate) {
        entry.endDate = new Date();
      }
    });

    const currentUser = req.user;
    console.log("Current User:", req.user);

    if (monitor.assigned?.length > 0) {
      const oldUserId = monitor.assigned[0]._id;
      const lastHistory = monitor.assignmentHistory.find(
        (h) => h.user.toString() === oldUserId.toString() && !h.endDate
      );
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser._id;
      }
    }

    const newUser = await User.findById(newUserId);
    if (!newUser) {
      return res.status(404).json({ message: "Không tìm thấy user mới" });
    }
    console.log(newUser);

    monitor.assignmentHistory.push({
      user: newUser._id,
      userName: newUser.fullname,
      startDate: new Date(),
      notes: notes || "",
      assignedBy: currentUser.id,
      jobTitle: newUser.jobTitle || "Không xác định",
    });

    monitor.currentHolder = {
      id: newUser._id,
      fullname: newUser.fullname,
      jobTitle: newUser.jobTitle,
      department: newUser.department,
      avatarUrl: newUser.avatarUrl,
    };

    monitor.assigned = [newUser._id];
    monitor.status = "PendingDocumentation";
    await monitor.save();

    const populatedMonitor = await monitor.populate({
      path: "assignmentHistory.user",
      select: "fullname jobTitle avatarUrl",
    });

    res.status(200).json(populatedMonitor);
  } catch (error) {
    console.error("Lỗi assignMonitor:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

// Thu hồi monitor
exports.revokeMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { revokedBy, reasons, status } = req.body;

    const monitor = await Monitor.findById(id).populate("assigned");
    if (!monitor) {
      return res.status(404).json({ message: "Monitor không tồn tại" });
    }

    const currentUser = req.user;

    if (monitor.assigned.length > 0) {
      const oldUserId = monitor.assigned[0]._id;
      const lastHistory = monitor.assignmentHistory.find(
        (hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate
      );
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser.id;
        lastHistory.revokedReason = reasons;
      }
    } else {
      monitor.assignmentHistory.push({
        revokedBy,
        revokedReason: reasons,
        endDate: new Date(),
      });
    }

    monitor.status = status || "Standby";
    monitor.currentHolder = null;
    monitor.assigned = [];
    await monitor.save();

    res.status(200).json({ message: "Thu hồi thành công", monitor });
  } catch (error) {
    console.error("Lỗi revokeMonitor:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

// Cập nhật trạng thái monitor
exports.updateMonitorStatus = async (req, res) => {
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
      const monitor = await Monitor.findById(id);
      if (!monitor) {
        return res.status(404).json({ message: "Không tìm thấy thiết bị" });
      }

      if (status === "Broken") {
        monitor.brokenReason = brokenReason || "Không xác định";
      }

      monitor.status = status;
      await monitor.save();

      res.status(200).json(monitor);
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái:", error);
      res.status(500).json({ message: "Lỗi máy chủ", error });
    }
  } catch (error) {
    console.error("Lỗi updateMonitorStatus:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

exports.uploadHandoverReport = async (req, res) => {
  console.log("📤 Dữ liệu nhận được từ frontend:", req.body);
  try {
    const { monitorId, userId, username } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "File không được tải lên." });
    }

    console.log("✅ Trong Controller - username nhận được:", username);

    const filePath = req.file.path;
    console.log("✅ Đường dẫn file đã lưu:", filePath);

    const monitor = await Monitor.findById(monitorId);
    if (!monitor) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị." });
    }

    console.log("✅ Tìm thấy monitor:", monitor);

    let currentAssignment = monitor.assignmentHistory.find(
      (history) => 
        history.user && 
        history.user.toString() === userId && 
        !history.endDate
    );

    if (!currentAssignment) {
      console.warn("⚠️ Không tìm thấy lịch sử bàn giao hợp lệ. Tạo bản ghi mới...");
      monitor.assignmentHistory.push({
        user: new mongoose.Types.ObjectId(userId),
        startDate: new Date(),
        document: filePath,
      });

      currentAssignment = monitor.assignmentHistory[monitor.assignmentHistory.length - 1];
    } else {
      console.log("🔄 Cập nhật lịch sử bàn giao hiện tại.");
      currentAssignment.document = filePath;
    }

    monitor.status = "Active";
    await monitor.save();

    return res.status(200).json({
      message: "Tải lên biên bản thành công!",
      monitor,
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