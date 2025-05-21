const Printer = require("../../models/Printer");
const User = require("../../models/Users");
const Room = require("../../models/Room");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Lấy danh sách printer
exports.getPrinters = async (req, res) => {
  try {
    const printers = await Printer.find()
      .sort({ createdAt: -1 })
      .populate("assigned", "fullname jobTitle department avatarUrl")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email title")
      .populate("assignmentHistory.revokedBy", "fullname email")
      .lean();

    const populatedPrinters = printers.map((printer) => ({
      ...printer,
      room: printer.room
        ? {
            ...printer.room,
            location:
              printer.room.location?.map(
                (loc) => `${loc.building}, tầng ${loc.floor}`
              ) || ["Không xác định"],
          }
        : { name: "Không xác định", location: ["Không xác định"] },
    }));

    return res.status(200).json({ populatedPrinters });
  } catch (error) {
    console.error("Error fetching printers:", error.message);
    return res.status(500).json({
      message: "Error fetching printers",
      error: error.message,
    });
  }
};

// Lấy thông tin chi tiết của 1 printer
exports.getPrinterById = async (req, res) => {
  const { id } = req.params;
  console.log("Payload nhận được từ client:", req.body);
  try {
    const printer = await Printer.findById(id)
      .populate("assigned", "fullname email jobTitle avatarUrl")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.revokedBy", "fullname email jobTitle avatarUrl");

    if (!printer) {
      return res.status(404).json({ message: "Không tìm thấy printer" });
    }
    res.status(200).json(printer);
  } catch (error) {
    res.status(500).json({ message: "Lỗi máy chủ", error });
  }
};

// Thêm mới printer
exports.createPrinter = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { name, manufacturer, serial, assigned, status, specs, type, room, reason } = req.body;
    const userId = req.body.userId || req.headers["user-id"];

    if (!name || !serial) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
    }
    if (!specs || typeof specs !== "object") {
      return res.status(400).json({ message: "Thông tin specs không hợp lệ!" });
    }
    const existingPrinter = await Printer.findOne({ serial });
    if (existingPrinter) {
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
    if (status && !["Active", "Standby", "Broken", "PendingDocumentation"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }

    const printer = new Printer({
      name,
      manufacturer,
      serial,
      assigned,
      specs,
      status,
      type,
      room,
      reason: status === "Broken" ? reason : undefined,
    });

    await printer.save();
    res.status(201).json(printer);
  } catch (error) {
    console.error("Error creating printer:", error.message);
    res.status(500).json({ message: "Lỗi khi thêm printer", error: error.message });
  }
};

// Cập nhật printer
exports.updatePrinter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, specs, type, room, reason } = req.body;

    if (assigned && !Array.isArray(assigned)) {
      return res.status(400).json({ message: "Assigned phải là mảng ID người sử dụng hợp lệ." });
    }
    if (room && !mongoose.Types.ObjectId.isValid(room)) {
      return res.status(400).json({ message: "Room ID không hợp lệ!" });
    }

    const printer = await Printer.findByIdAndUpdate(
      id,
      {
        name,
        manufacturer,
        serial,
        assigned,
        status,
        releaseYear,
        specs,
        type,
        room,
        reason: status === "Broken" ? reason : undefined,
      },
      { new: true }
    );

    if (!printer) {
      return res.status(404).json({ message: "Không tìm thấy printer" });
    }
    res.json(printer);
  } catch (error) {
    console.error("Error updating printer:", error.message);
    res.status(400).json({ message: "Error updating printer", error: error.message });
  }
};

// Xóa printer
exports.deletePrinter = async (req, res) => {
  try {
    await Printer.findByIdAndDelete(req.params.id);
    res.json({ message: "Printer deleted" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting printer", error });
  }
};

// Cập nhật thông tin specs của printer
exports.updatePrinterSpecs = async (req, res) => {
  try {
    console.log("Payload nhận được từ frontend:", req.body);
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;

    const currentPrinter = await Printer.findById(id);
    if (!currentPrinter) {
      return res.status(404).json({ message: "Printer không tồn tại." });
    }

    const cleanedSpecs = {
      ip: specs.ip ?? currentPrinter.specs.ip,
      ram: specs.ram ?? currentPrinter.specs.ram,
      storage: specs.storage ?? currentPrinter.specs.storage,
      display: specs.display ?? currentPrinter.specs.display,
    };

    const updates = {
      specs: cleanedSpecs,
      releaseYear: releaseYear ?? currentPrinter.releaseYear,
      manufacturer: manufacturer ?? currentPrinter.manufacturer,
      type: type ?? currentPrinter.type,
    };

    console.log("Payload để cập nhật (sau khi làm sạch):", updates);
    const updatedPrinter = await Printer.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedPrinter) {
      return res.status(404).json({ message: "Không thể cập nhật printer." });
    }
    console.log("Printer sau khi cập nhật:", updatedPrinter);
    res.status(200).json(updatedPrinter);
  } catch (error) {
    console.error("Lỗi khi cập nhật specs:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Tải lên hàng loạt printer
exports.bulkUploadPrinters = async (req, res) => {
  try {
    const { printers } = req.body;
    console.log("Printers:", printers);
    if (!printers || !Array.isArray(printers) || printers.length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu hợp lệ để tải lên!" });
    }

    const errors = [];
    const validPrinters = [];

    for (const printer of printers) {
      try {
        printer.room = printer.room && mongoose.Types.ObjectId.isValid(printer.room) ? printer.room : null;
        printer.status = ["Active", "Standby", "Broken", "PendingDocumentation"].includes(printer.status)
          ? printer.status
          : "Standby";

        if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(printer.status)) {
          console.warn(`Status không hợp lệ: ${printer.status}. Thiết lập giá trị 'Standby'.`);
          printer.status = "Standby";
        }
        if (printer.assigned && Array.isArray(printer.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(printer.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: printer.assigned } }).select("_id");
            if (validIds.length !== printer.assigned.length) {
              throw new Error("Một số ID người dùng không tồn tại trong hệ thống.");
            }
          } else {
            const assignedIds = await Promise.all(
              printer.assigned.map(async (fullname) => {
                const user = await User.findOne({ fullname: fullname.trim() }).select("_id");
                if (!user) {
                  throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                }
                return user._id;
              })
            );
            printer.assigned = assignedIds;
          }
        }
        if (printer.room && !mongoose.Types.ObjectId.isValid(printer.room)) {
          throw new Error(`Room ID "${printer.room}" không hợp lệ.`);
        }
        if (!printer.name || !printer.serial) {
          errors.push({
            serial: printer.serial || "Không xác định",
            message: "Thông tin printer không hợp lệ (thiếu tên, serial).",
          });
          continue;
        }
        const existingPrinter = await Printer.findOne({ serial: printer.serial });
        if (existingPrinter) {
          errors.push({
            serial: printer.serial,
            name: printer.name,
            message: `Serial ${printer.serial} đã tồn tại.`,
          });
          continue;
        }
        validPrinters.push(printer);
      } catch (error) {
        errors.push({
          serial: printer.serial || "Không xác định",
          message: error.message || "Lỗi không xác định khi xử lý printer.",
        });
      }
    }

    if (validPrinters.length > 0) {
      await Printer.insertMany(validPrinters);
    }

    res.status(201).json({
      message: "Thêm mới hàng loạt thành công!",
      addedPrinters: validPrinters.length,
      errors,
    });
  } catch (error) {
    console.error("Lỗi khi thêm mới hàng loạt:", error.message);
    res.status(500).json({ message: "Lỗi khi thêm mới hàng loạt", error: error.message });
  }
};

// Bàn giao printer
exports.assignPrinter = async (req, res) => {
  try {
    const { id } = req.params; // printerId
    const { newUserId, notes } = req.body;

    const printer = await Printer.findById(id).populate("assigned");
    if (!printer) {
      return res.status(404).json({ message: "Không tìm thấy printer" });
    }

    // Đóng các bản ghi assignment trước đó
    printer.assignmentHistory.forEach((entry) => {
      if (!entry.endDate) {
        entry.endDate = new Date();
      }
    });

    const currentUser = req.user;
    console.log("Current User:", req.user);

    if (printer.assigned?.length > 0) {
      const oldUserId = printer.assigned[0]._id;
      const lastHistory = printer.assignmentHistory.find(
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

    printer.assignmentHistory.push({
      user: newUser._id,
      userName: newUser.fullname,
      startDate: new Date(),
      notes: notes || "",
      assignedBy: currentUser.id,
      jobTitle: newUser.jobTitle || "Không xác định",
    });

    printer.currentHolder = {
      id: newUser._id,
      fullname: newUser.fullname,
      jobTitle: newUser.jobTitle,
      department: newUser.department,
      avatarUrl: newUser.avatarUrl,
    };

    printer.assigned = [newUser._id];
    printer.status = "PendingDocumentation";
    await printer.save();

    const populatedPrinter = await printer.populate({
      path: "assignmentHistory.user",
      select: "fullname jobTitle avatarUrl",
    });
    
    res.status(200).json(populatedPrinter);
  } catch (error) {
    console.error("Lỗi assignPrinter:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

// Thu hồi printer
exports.revokePrinter = async (req, res) => {
  try {
    const { id } = req.params;
    const { revokedBy, reasons, status } = req.body;

    const printer = await Printer.findById(id).populate("assigned");
    if (!printer) {
      return res.status(404).json({ message: "Printer không tồn tại" });
    }

    const currentUser = req.user;
    if (printer.assigned.length > 0) {
      const oldUserId = printer.assigned[0]._id;
      const lastHistory = printer.assignmentHistory.find(
        (hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate
      );
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser.id;
        lastHistory.revokedReason = reasons;
      }
    } else {
      printer.assignmentHistory.push({
        revokedBy,
        revokedReason: reasons,
        endDate: new Date(),
      });
    }

    printer.status = status || "Standby";
    printer.currentHolder = null;
    printer.assigned = [];
    await printer.save();

    res.status(200).json({ message: "Thu hồi thành công", printer });
  } catch (error) {
    console.error("Lỗi revokePrinter:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

// Cập nhật trạng thái printer
exports.updatePrinterStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason } = req.body;

    if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }
    if (status === "Broken" && !brokenReason) {
      return res.status(400).json({ error: "Lý do báo hỏng là bắt buộc!" });
    }

    const printer = await Printer.findById(id);
    if (!printer) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị" });
    }

    if (status === "Broken") {
      printer.brokenReason = brokenReason || "Không xác định";
    }

    printer.status = status;
    await printer.save();

    res.status(200).json(printer);
  } catch (error) {
    console.error("Lỗi updatePrinterStatus:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

exports.uploadHandoverReport = async (req, res) => {
  console.log("📤 Dữ liệu nhận được từ frontend:", req.body);
  try {
    const { printerId, userId, username } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: "File không được tải lên." });
    }
    
    console.log("✅ Trong Controller - username nhận được:", username);
    
    const filePath = req.file.path;
    console.log("✅ Đường dẫn file đã lưu:", filePath);
    
    const printer = await Printer.findById(printerId);
    if (!printer) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị." });
    }
    
    console.log("✅ Tìm thấy printer:", printer);
    
    // Kiểm tra xem userId có hợp lệ không
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "userId không hợp lệ." });
    }
    
    // Tìm lịch sử bàn giao với userId hợp lệ
    let currentAssignment = printer.assignmentHistory.find(
      (history) => 
        history.user && 
        history.user.toString() === userId && 
        !history.endDate
    );
    
    if (!currentAssignment) {
      console.warn("⚠️ Không tìm thấy lịch sử bàn giao hợp lệ. Tạo bản ghi mới...");
      printer.assignmentHistory.push({
        user: mongoose.Types.ObjectId(userId),
        startDate: new Date(),
        document: filePath,
      });
      currentAssignment = printer.assignmentHistory[printer.assignmentHistory.length - 1];
    } else {
      console.log("🔄 Cập nhật lịch sử bàn giao hiện tại.");
      currentAssignment.document = filePath;
    }
    
    printer.status = "Active";
    await printer.save();
    
    return res.status(200).json({
      message: "Tải lên biên bản thành công!",
      printer,
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