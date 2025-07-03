const Tool = require("../../models/Tool");
const path = require("path");
const fs = require("fs");
const User = require("../../models/Users");
const Room = require("../../models/Room")
const mongoose = require("mongoose");
const upload = require("../../middleware/uploadHandover"); // Middleware Multer


// Lấy danh sách tool
exports.getTools = async (req, res) => {
  try {
    // Get search and filter parameters
    const { search, status, manufacturer, type, releaseYear } = req.query;
    
    // Build filter query
    const query = {};
    
    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { serial: { $regex: search, $options: "i" } },
        { manufacturer: { $regex: search, $options: "i" } }
      ];
    }
    
    // Add status filter
    if (status) {
      query.status = status;
    }
    
    // Add manufacturer filter
    if (manufacturer) {
      query.manufacturer = { $regex: manufacturer, $options: "i" };
    }
    
    // Add type filter
    if (type) {
      query.type = { $regex: type, $options: "i" };
    }
    
    // Add release year filter
    if (releaseYear) {
      query.releaseYear = parseInt(releaseYear);
    }
    
    const tools = await Tool.find(query)
      .sort({ createdAt: -1 })  // sắp xếp giảm dần theo createdAt
      .populate("assigned", "fullname jobTitle department avatarUrl")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email title")
      .populate("assignmentHistory.revokedBy", "fullname email")
      .lean();

    // Nếu vẫn muốn reshape (thêm field `location` dạng string), bạn làm như cũ:
    const populatedTools = tools.map((tool) => ({
      ...tool,
      room: tool.room
        ? {
            ...tool.room,
            location:
              tool.room.location?.map(
                (loc) => `${loc.building}, tầng ${loc.floor}`
              ) || ["Không xác định"],
          }
        : { name: "Không xác định", location: ["Không xác định"] },
    }));

    // Trả về *toàn bộ* mà không kèm totalPages/currentPage
    return res.status(200).json({
      populatedTools,
    });
  } catch (error) {
    console.error("Error fetching tools:", error.message);
    return res.status(500).json({
      message: "Error fetching tools",
      error: error.message,
    });
  }
};

// Thêm mới tool
exports.createTool = async (req, res) => {
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
    const existingTool = await Tool.findOne({ serial });
    if (existingTool) {
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

    const tool = new Tool({
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

    await tool.save();
    res.status(201).json(tool);
  } catch (error) {
    console.error("Error creating tool:", error.message);
    res.status(500).json({ message: "Lỗi khi thêm tool", error: error.message });
  }
};

exports.updateTool = async (req, res) => {
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

    // Nếu status gửi lên không hợp lệ => giữ nguyên tool cũ (tránh set bậy)
    let validStatus = status;
    if (!["Active", "Standby", "Broken", "PendingDocumentation"].includes(status)) {
      // Tìm tool cũ để lấy lại status
      const oldTool = await Tool.findById(id).lean();
      if (!oldTool) {
        return res.status(404).json({ message: "Không tìm thấy tool." });
      }
      validStatus = oldTool.status;
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

    const tool = await Tool.findByIdAndUpdate(id, updatedData, { new: true });

    if (!tool) {
      return res.status(404).json({ message: "Không tìm thấy tool" });
    }

    res.json(tool);
  } catch (error) {
    console.error("Error updating tool:", error.message);
    res
      .status(400)
      .json({ message: "Error updating tool", error: error.message });
  }
};

// Xóa tool
exports.deleteTool = async (req, res) => {
  try {
    await Tool.findByIdAndDelete(req.params.id);
    res.json({ message: "Tool deleted" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting tool", error });
  }
};

// Thêm / Sửa ở toolController.js
exports.bulkUploadTools = async (req, res) => {
  try {
    const { tools } = req.body;
    console.log("Tools:", tools);
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return res
        .status(400)
        .json({ message: "Không có dữ liệu hợp lệ để tải lên!" });
    }

    const errors = [];
    const validTools = [];

    for (const tool of tools) {
      try {
        // Kiểm tra room, gán null nếu không hợp lệ
        tool.room =
          tool.room && mongoose.Types.ObjectId.isValid(tool.room)
            ? tool.room
            : null;

        // Kiểm tra status. Nếu không thuộc các trạng thái dưới => ép về Standby
        if (
          !["Active", "Standby", "Broken", "PendingDocumentation"].includes(
            tool.status
          )
        ) {
          tool.status = "Standby";
        }

        // Kiểm tra assigned
        if (tool.assigned && Array.isArray(tool.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(tool.assigned[0]);
          if (isId) {
            // Nếu assigned là mảng ID => kiểm tra user có tồn tại
            const validIds = await User.find({
              _id: { $in: tool.assigned },
            }).select("_id");
            if (validIds.length !== tool.assigned.length) {
              throw new Error("Một số ID người dùng không tồn tại trong hệ thống.");
            }
          } else {
            // Nếu assigned là mảng fullname => convert sang ID
            const assignedIds = await Promise.all(
              tool.assigned.map(async (fullname) => {
                const user = await User.findOne({
                  fullname: fullname.trim(),
                }).select("_id");
                if (!user) {
                  throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                }
                return user._id;
              })
            );
            tool.assigned = assignedIds;
          }
        }

        // Nếu tool.assigned có user => ép status sang PendingDocumentation nếu đang Standby
        if (
          tool.assigned &&
          tool.assigned.length > 0 &&
          tool.status === "Standby"
        ) {
          tool.status = "PendingDocumentation";
        }

        // Kiểm tra room
        if (tool.room && !mongoose.Types.ObjectId.isValid(tool.room)) {
          throw new Error(`Room ID "${tool.room}" không hợp lệ.`);
        }

        // Kiểm tra name, serial
        if (!tool.name || !tool.serial) {
          errors.push({
            serial: tool.serial || "Không xác định",
            message: "Thông tin tool không hợp lệ (thiếu tên, serial).",
          });
          continue;
        }

        // Kiểm tra trùng serial
        const existingTool = await Tool.findOne({ serial: tool.serial });
        if (existingTool) {
          errors.push({
            serial: tool.serial,
            name: tool.name,
            message: `Serial ${tool.serial} đã tồn tại.`,
          });
          continue;
        }

        validTools.push(tool);
      } catch (error) {
        errors.push({
          serial: tool.serial || "Không xác định",
          message: error.message || "Lỗi không xác định khi xử lý tool.",
        });
      }
    }

    // Nếu có tool hợp lệ, ghi vào DB
    if (validTools.length > 0) {
      await Tool.insertMany(validTools);
    }

    res.status(201).json({
      message: "Thêm mới hàng loạt thành công!",
      addedTools: validTools.length,
      errors,
    });
  } catch (error) {
    console.error("Lỗi khi thêm mới hàng loạt:", error.message);
    res
      .status(500)
      .json({ message: "Lỗi khi thêm mới hàng loạt", error: error.message });
  }
};

// controllers/toolController.js
// Thêm / Sửa ở toolController.js
exports.assignTool = async (req, res) => {
  try {
    const { id } = req.params; // toolId
    const { newUserId, notes } = req.body;

    const tool = await Tool.findById(id).populate("assigned");
    if (!tool) {
      return res.status(404).json({ message: "Không tìm thấy tool" });
    }

    // Đóng hết các assignmentHistory cũ
    tool.assignmentHistory.forEach((entry) => {
      if (!entry.endDate) {
        entry.endDate = new Date();
      }
    });

    const currentUser = req.user; // Lấy thông tin người đang đăng nhập (nếu có middleware auth)

    // Nếu tool đã có assigned => đóng bản ghi cũ
    if (tool.assigned?.length > 0) {
      const oldUserId = tool.assigned[0]._id;
      const lastHistory = tool.assignmentHistory.find(
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
    tool.assignmentHistory.push({
      user: newUser._id,
      userName: newUser.fullname,
      startDate: new Date(),
      notes: notes || "",
      assignedBy: currentUser?.id || null,
      jobTitle: newUser.jobTitle || "Không xác định",
    });

    // Cập nhật currentHolder
    tool.currentHolder = {
      id: newUser._id,
      fullname: newUser.fullname,
      jobTitle: newUser.jobTitle,
      department: newUser.department,
      avatarUrl: newUser.avatarUrl,
    };

    // Cập nhật assigned
    tool.assigned = [newUser._id];

    // *** THIẾT LẬP TRẠNG THÁI *** 
    // Mặc định khi bàn giao: PendingDocumentation (nếu chưa có biên bản)
    tool.status = "PendingDocumentation";

    await tool.save();

    // Populate assignmentHistory.user để trả về thông tin chi tiết
    const populatedTool = await tool.populate({
      path: "assignmentHistory.user",
      select: "fullname jobTitle avatarUrl department",
    });

    res.status(200).json(populatedTool);
  } catch (error) {
    console.error("Lỗi assignTool:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

// controllers/toolController.js
exports.revokeTool = async (req, res) => {
  try {
    const { id } = req.params;
    const { revokedBy, reasons, status } = req.body;

    const tool = await Tool.findById(id).populate("assigned");
    if (!tool) {
      return res.status(404).json({ message: "Tool không tồn tại" });
    }

    const currentUser = req.user; // Người thực hiện thu hồi

    if (tool.assigned.length > 0) {
      const oldUserId = tool.assigned[0]._id;
      const lastHistory = tool.assignmentHistory.find(
        (hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate
      );
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser.id; // Ghi lại người thu hồi
        lastHistory.revokedReason = reasons; // Ghi lý do thu hồi vào bản ghi hiện tại
      }
    } else {
      // Nếu không có bản ghi nào đang mở, thêm một bản ghi mới
      tool.assignmentHistory.push({
        revokedBy,
        revokedReason: reasons,
        endDate: new Date(),
      });
    }

    // Cập nhật trạng thái thiết bị
    tool.status = status || "Standby"; // Hoặc trạng thái bạn mong muốn
    tool.currentHolder = null; // Xóa người đang giữ tool
    tool.assigned = [];
    await tool.save();

    res.status(200).json({ message: "Thu hồi thành công", tool });
  } catch (error) {
    console.error("Lỗi revokeTool:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

exports.updateToolStatus = async (req, res) => {
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
        const tool = await Tool.findById(id);
        if (!tool) {
          return res.status(404).json({ message: "Không tìm thấy thiết bị" });
        }
    
        // Lưu lý do báo hỏng vào `reason`
        if (status === "Broken") {
          tool.brokenReason = brokenReason || "Không xác định";
        }
    
        tool.status = status;
        await tool.save();
    
        res.status(200).json(tool);
      } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái:", error);
        res.status(500).json({ message: "Lỗi máy chủ", error });
      }
  } catch (error) {
    console.error("Lỗi updateToolStatus:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};

exports.searchTools = async (req, res) => {
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

    const tools = await Tool.find(searchQuery)
      .populate("assigned", "fullname jobTitle department avatarUrl")
      .populate("room", "name location status")
      .lean(); // Trả về object thường

    res.status(200).json(tools);
  } catch (error) {
    console.error("Error during search:", error.message);
    res.status(500).json({ message: "Lỗi khi tìm kiếm tools", error: error.message });
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
    const { toolId, userId, username } = req.body;

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
    const oldPath = path.join(__dirname, "../../uploads/Handovers", originalFileName);
    const newPath = path.join(__dirname, "../../uploads/Handovers", sanitizedName);
    fs.renameSync(oldPath, newPath);

    const tool = await Tool.findById(toolId);
    if (!tool) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị." });
    }

    console.log("✅ Tìm thấy tool:", tool);

    let currentAssignment = tool.assignmentHistory.find(
      (history) => 
        history.user && 
        history.user.toString() === userId && 
        !history.endDate
    );

    if (!currentAssignment) {
      console.warn("⚠️ Không tìm thấy lịch sử bàn giao hợp lệ. Tạo bản ghi mới...");
      tool.assignmentHistory.push({
        user: new mongoose.Types.ObjectId(userId),
        startDate: new Date(),
        document: originalFileName,
      });

      currentAssignment = tool.assignmentHistory[tool.assignmentHistory.length - 1];
    } else {
      console.log("🔄 Cập nhật lịch sử bàn giao hiện tại.");
      currentAssignment.document = sanitizedName;
    }

    tool.status = "Active";
    await tool.save();

    return res.status(200).json({
      message: "Tải lên biên bản thành công!",
      tool,
    });
  } catch (error) {
    console.error("❌ Lỗi khi tải lên biên bản:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi server." });
  }
};

// Endpoint để trả file PDF
exports.getHandoverReport = async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "../../uploads/Handovers", filename);

  // Kiểm tra file có tồn tại không
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Không tìm thấy file." });
  }

  // Gửi file PDF
  res.sendFile(filePath);
};

// Lấy thông tin chi tiết tool
exports.getToolById = async (req, res) => {
  const { id } = req.params;

  try {
    const tool = await Tool.findById(id)
      .populate("assigned", "fullname email jobTitle avatarUrl department")
      .populate("room", "name location status")
      .populate("assignmentHistory.user", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.assignedBy", "fullname email jobTitle avatarUrl")
      .populate("assignmentHistory.revokedBy", "fullname email jobTitle avatarUrl");

    if (!tool) {
      return res.status(404).json({ message: "Không tìm thấy tool" });
    }

    res.status(200).json(tool);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin tool:", error);
    res.status(500).json({ message: "Lỗi máy chủ", error });
  }
};

// Cập nhật thông tin specs của tool
exports.updateToolSpecs = async (req, res) => {
  try {
    console.log("Payload nhận được từ frontend:", req.body);

    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;

    // Lấy tool hiện tại từ DB
    const currentTool = await Tool.findById(id);
    if (!currentTool) {
      return res.status(404).json({ message: "Tool không tồn tại." });
    }

    // Làm sạch dữ liệu specs
    const cleanedSpecs = {
      processor: specs.processor ?? currentTool.specs.processor,
      ram: specs.ram ?? currentTool.specs.ram,
      storage: specs.storage ?? currentTool.specs.storage,
      display: specs.display ?? currentTool.specs.display,
    };

    // Cập nhật payload
    const updates = {
      specs: cleanedSpecs,
      releaseYear: releaseYear ?? currentTool.releaseYear,
      manufacturer: manufacturer ?? currentTool.manufacturer,
      type: type ?? currentTool.type,
    };

    console.log("Payload để cập nhật (sau khi làm sạch):", updates);

    const updatedTool = await Tool.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedTool) {
      return res.status(404).json({ message: "Không thể cập nhật tool." });
    }

    console.log("Tool sau khi cập nhật:", updatedTool);
    res.status(200).json(updatedTool);
  } catch (error) {
    console.error("Lỗi khi cập nhật specs:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Thêm hàm này trong toolController.js
exports.fixOldData = async (req, res) => {
  try {
    // Lấy tất cả tool
    const allTools = await Tool.find()
      .populate("assigned")
      .populate("assignmentHistory.user");

    let updatedCount = 0;

    for (const tool of allTools) {
      let needSave = false;

      // 1) Nếu tool có assigned (≠ rỗng)
      if (tool.assigned && tool.assigned.length > 0) {
        // Lấy user cuối (nếu mảng assigned > 1, coi user cuối cùng là người đang giữ)
        const lastUser = tool.assigned[tool.assigned.length - 1];

        // Tìm trong assignmentHistory record chưa có endDate, ứng với lastUser
        let openRecord = tool.assignmentHistory.find(
          (h) => !h.endDate && h.user?.toString() === lastUser._id.toString()
        );

        // Nếu chưa có record, tạo mới
        if (!openRecord) {
          tool.assignmentHistory.forEach((h) => {
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
          tool.assignmentHistory.push(openRecord);
          needSave = true;
        }

        // Xét xem record đó có document hay chưa
        if (!openRecord.document) {
          // Thiếu biên bản => "PendingDocumentation"
          if (tool.status !== "PendingDocumentation") {
            tool.status = "PendingDocumentation";
            needSave = true;
          }
        } else {
          // Có document => "Active"
          if (tool.status !== "Active") {
            tool.status = "Active";
            needSave = true;
          }
        }

        // Cập nhật currentHolder
        if (
          !tool.currentHolder ||
          tool.currentHolder.id?.toString() !== lastUser._id.toString()
        ) {
          tool.currentHolder = {
            id: lastUser._id,
            fullname: lastUser.fullname || "Không xác định",
            jobTitle: lastUser.jobTitle || "",
            department: lastUser.department || "",
            avatarUrl: lastUser.avatarUrl || "",
          };
          needSave = true;
        }
      } else {
        // 2) Nếu tool không có assigned => về Standby
        // Nhưng có thể còn record cũ chưa đóng => đóng hết
        let openRecords = tool.assignmentHistory.filter(
          (h) => !h.endDate
        );
        if (openRecords.length > 0) {
          for (let record of openRecords) {
            record.endDate = new Date();
          }
          needSave = true;
        }

        // Nếu status != Standby, ta ép về Standby (tuỳ nghiệp vụ)
        if (tool.status !== "Standby") {
          tool.status = "Standby";
          needSave = true;
        }

        // Xoá currentHolder
        if (tool.currentHolder) {
          tool.currentHolder = null;
          needSave = true;
        }
      }

      // 3) Lưu nếu có thay đổi
      if (needSave) {
        await tool.save();
        updatedCount++;
      }
    }

    res.json({
      message: "Hoàn thành chuẩn hoá dữ liệu cũ.",
      totalTools: allTools.length,
      updatedCount,
    });
  } catch (error) {
    console.error("Lỗi fixOldData:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi chuẩn hoá.", error });
  }
};

// Get filter options for tools
exports.getToolFilterOptions = async (req, res) => {
  try {
    console.log('[Filter Options] Fetching tool filter options');
    
    // Aggregate data from all tools
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

    const result = await Tool.aggregate(aggregationPipeline);
    
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
    console.error('Error fetching tool filter options:', error);
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