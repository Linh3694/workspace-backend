const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");
const User = require ("../../models/Users");
const Teacher = require("../../models/Teacher");
const Parent = require("../../models/Parent");

// Thêm import cho Redis service và các models thiết bị (cần tạo sau)
// const redisService = require('../services/redisService');
// const Laptop = require("../models/Laptop");
// const Monitor = require("../models/Monitor");
// const Projector = require("../models/Projector");
// const Printer = require("../models/Printer");
// const Tool = require("../models/Tool");

// Đăng nhập


// Tạo người dùng mới
exports.createUser = async (req, res) => {
  try {
    const { password, email, phone, role, fullname, active } = req.body;
    const avatarUrl = req.file ? `/uploads/Avatar/${req.file.filename}` : null;

    // Kiểm tra dữ liệu đầu vào
    if (!password || !email || !role || !fullname) {
      return res.status(400).json({ message: "Password, email, role, and fullname are required" });
    }

    // Kiểm tra role hợp lệ
    const validRoles = ["admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user","librarian"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
    }

    // Kiểm tra trùng username hoặc email
    const existingUser = await User.findOne({ $or: [{ email }] });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      password: hashedPassword,
      email,
      phone,
      role,
      fullname,
      active: active !== undefined ? active : true,
      avatarUrl
    });

    await newUser.save();

    // Nếu role là teacher, tạo bản ghi Teacher tương ứng
    if (role === "teacher") {
      await Teacher.create({
        user: newUser._id,
        fullname: newUser.fullname,
        email: newUser.email,
        avatarUrl: newUser.avatarUrl,
        subjects: [],
        classes: [],
        school: req.body.school || req.user?.school
      });
    }

    // Xóa cache danh sách users (nếu có Redis)
    // await redisService.deleteAllUsersCache();

    return res.status(201).json({
      _id: newUser._id,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      fullname: newUser.fullname,
      avatarUrl: newUser.avatarUrl,
      active: newUser.active,
      message: "Tạo người dùng thành công"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Lấy tất cả người dùng
exports.getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    let query = {};

    // Lọc theo role nếu có
    if (role) {
      const validRoles = ["admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user","librarian"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }
      query.role = role;
    }

    // Kiểm tra cache trước (nếu có Redis service)
    // let users = await redisService.getAllUsers();
    
    // if (!users) {
      // Nếu không có trong cache, truy vấn database
      const users = await User.find(query).select("-password").sort({ createdAt: -1 });
      
      // Chỉ lưu vào cache nếu users không phải là undefined/null và có dữ liệu
      // if (users && Array.isArray(users)) {
      //   await redisService.setAllUsers(users);
      // }
    // }

    // Đảm bảo luôn trả về một array, ngay cả khi users là null/undefined
    const responseUsers = users || [];
    return res.json(responseUsers);
  } catch (err) {
    console.error("Error fetching users:", err.message);
    return res.status(500).json({ 
      message: "Error fetching users", 
      error: err.message 
    });
  }
};

// Lấy người dùng theo ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = id === "me" ? req.user?.id : id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Kiểm tra cache trước (nếu có Redis)
    // let user = await redisService.getUserData(userId);
    
    // if (!user) {
      // Nếu không có trong cache, truy vấn database
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Lưu vào cache (nếu có Redis)
      // await redisService.setUserData(userId, user);
    // }

    return res.json(user);
  } catch (err) {
    console.error("Error fetching user by ID:", err.message);
    return res.status(500).json({ 
      message: "Server error", 
      error: err.message 
    });
  }
};

// Cập nhật người dùng
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone, role, fullname, active } = req.body;
    const avatarUrl = req.file ? `/uploads/Avatar/${req.file.filename}` : undefined;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Kiểm tra role hợp lệ (nếu thay đổi)
    if (role) {
      const validRoles = ["admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user","librarian"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }
    }

    // Kiểm tra trùng username hoặc email (nếu thay đổi)
    if (email) {
      const existingUser = await User.findOne({
        $or: [{ email }],
        _id: { $ne: id },
      });
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // Lấy thông tin user cũ để kiểm tra role
    const oldUser = await User.findById(id);
    if (!oldUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        email,
        phone,
        role,
        fullname,
        active,
        avatarUrl,
        updatedAt: Date.now(),
      },
      { new: true, omitUndefined: true }
    ).select("-password");

    // Xử lý thay đổi role
    if (role && role !== oldUser.role) {
      // Nếu role cũ là teacher, xóa bản ghi teacher
      if (oldUser.role === "teacher") {
        await Teacher.findOneAndDelete({ user: id });
      }

      // Nếu role mới là teacher, tạo bản ghi teacher mới
      if (role === "teacher") {
        await Teacher.create({
          user: id,
          fullname: updatedUser.fullname,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl,
          subjects: [],
          classes: []
        });
      }
    } else if (role === "teacher") {
      // Nếu role không thay đổi và là teacher, cập nhật thông tin teacher
      await Teacher.findOneAndUpdate(
        { user: id },
        {
          fullname: updatedUser.fullname,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl,
          updatedAt: Date.now()
        }
      );
    }

    // Xóa cache user (nếu có Redis)
    // await redisService.deleteUserCache(updatedUser._id);

    return res.json(updatedUser);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Xóa người dùng
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Không cho xóa admin chính (giả định admin đầu tiên)
    if (user.role === "admin" && (await User.countDocuments({ role: "admin" })) === 1) {
      return res.status(400).json({ message: "Cannot delete the last admin" });
    }

    // Xóa bản ghi teacher nếu user là teacher
    if (user.role === "teacher") {
      await Teacher.findOneAndDelete({ user: id });
    }

    await User.findByIdAndDelete(id);

    // Xóa cache liên quan (nếu có Redis)
    // await redisService.deleteUserCache(id);
    // await redisService.deleteAllUsersCache();

    return res.json({ message: "User deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Thay đổi mật khẩu
exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old password and new password are required" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Kiểm tra mật khẩu cũ
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect old password" });
    }

    // Mã hóa mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.updatedAt = Date.now();
    await user.save();

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Nhập hàng loạt người dùng từ Excel
exports.bulkUploadUsers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng tải lên file Excel" });
    }

    // Đọc file Excel từ buffer
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu trong file Excel" });
    }

    const usersToInsert = [];
    const errors = [];
    const validRoles = ["admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user"];

    for (const row of data) {
      const { Password, Email, Role, Fullname, Active } = row;

      // Kiểm tra dữ liệu bắt buộc
      if (!Password || !Email || !Role || !Fullname) {
        errors.push(`Thiếu thông tin bắt buộc ở dòng: ${JSON.stringify(row)}`);
        continue;
      }

      // Kiểm tra role hợp lệ
      if (!validRoles.includes(Role)) {
        errors.push(`Role không hợp lệ ở dòng ${Email}: ${Role}. Role phải là một trong: ${validRoles.join(", ")}`);
        continue;
      }

      // Kiểm tra trùng username hoặc email
      const existingUser = await User.findOne({ $or: [{ email: Email }] });
      if (existingUser) {
        errors.push(`Email đã tồn tại: ${Email}`);
        continue;
      }

      // Mã hóa mật khẩu
      const hashedPassword = await bcrypt.hash(Password, 10);

      usersToInsert.push({
        password: hashedPassword,
        email: Email,
        role: Role,
        fullname: Fullname,
        active: Active === true || Active === "true" || Active === 1,
      });
    }

    // Thêm vào database
    if (usersToInsert.length > 0) {
      const createdUsers = await User.insertMany(usersToInsert);

      // Tạo bản ghi Teacher cho các user có role là teacher
      const teachersToCreate = createdUsers.filter(user => user.role === 'teacher');
      if (teachersToCreate.length > 0) {
        const teacherRecords = teachersToCreate.map(user => ({
          user: user._id,
          fullname: user.fullname,
          email: user.email,
          subjects: [],
          classes: []
        }));
        await Teacher.insertMany(teacherRecords);
      }
    }

    if (errors.length > 0) {
      return res.status(207).json({
        message: `Đã import ${usersToInsert.length} người dùng, có ${errors.length} lỗi`,
        errors,
      });
    }

    return res.json({
      message: `Đã import thành công ${usersToInsert.length} người dùng`,
      success: true
    });
  } catch (err) {
    console.error('Error in bulkUploadUsers:', err);
    return res.status(500).json({
      message: "Lỗi khi xử lý file Excel",
      error: err.message
    });
  }
};


// Tìm kiếm người dùng theo fullname, username, email
exports.searchUsers = async (req, res) => {
  try {
    const { q, query: searchQuery, role } = req.query;
    
    // Chấp nhận cả 'q' và 'query' parameter để đảm bảo tương thích
    const searchTerm = q || searchQuery;

    // Kiểm tra tham số tìm kiếm
    if (!searchTerm) {
      return res.status(400).json({ message: "Search query (q or query) is required" });
    }

    // Tạo query tìm kiếm
    const searchRegex = new RegExp(searchTerm, "i"); // Không phân biệt hoa thường
    let query = {
      $or: [
        { fullname: searchRegex },
        { email: searchRegex },
      ],
    };

    // Lọc theo role nếu có
    if (role) {
      const validRoles = ["admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }
      query.role = role;
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ fullname: 1 })
      .limit(50); // Giới hạn kết quả để tối ưu

    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Reset mật khẩu (chỉ dành cho admin)
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Mã hóa mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.updatedAt = Date.now();
    await user.save();

    return res.json({ message: "Password reset successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Tạo nhiều người dùng cùng lúc
exports.createBatchUsers = async (req, res) => {
  try {
    console.log('createBatchUsers raw body:', JSON.stringify(req.body));
    // Chấp nhận cả hai định dạng: mảng thuần **hoặc** { users: [...] }
    const usersPayload = Array.isArray(req.body) ? req.body : req.body.users;
    console.log('createBatchUsers usersPayload:', JSON.stringify(usersPayload));
    if (!Array.isArray(usersPayload) || usersPayload.length === 0) {
      return res
        .status(400)
        .json({
          message: 'Dữ liệu không hợp lệ. Yêu cầu một mảng người dùng.',
          payload: req.body,
          usersPayload
        });
    }
    const users = usersPayload; 
    const defaultSchool = req.user?.school || req.body.defaultSchool || null;

    const validRoles = ["admin", "teacher", "parent", "registrar", "admission", "bos", "principal", "service", "superadmin", "technical", "marcom", "hr", "bod", "user"];
    const errors = [];
    const usersToInsert = [];
    const existingEmails = new Set();

    // Kiểm tra trùng lặp trong danh sách
    const emails = users.map(u => u.email);
    const existingUsers = await User.find({
      $or: [
        { email: { $in: emails } }
      ]
    }).select('email');

    existingUsers.forEach(user => {
      existingEmails.add(user.email);
    });

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const { password, email, phone, role, fullname, active } = user;

      // Kiểm tra dữ liệu bắt buộc
      if (!password || !email || !role || !fullname) {
        errors.push(`Dòng ${i + 1}: Thiếu thông tin bắt buộc`);
        continue;
      }

      // Kiểm tra role hợp lệ
      if (!validRoles.includes(role)) {
        errors.push(`Dòng ${i + 1}: Role không hợp lệ. Role phải là một trong: ${validRoles.join(", ")}`);
        continue;
      }

      if (existingEmails.has(email)) {
        errors.push(`Dòng ${i + 1}: Email '${email}' đã tồn tại`);
        continue;
      }

      // Thêm vào danh sách chờ và đánh dấu đã sử dụng
      existingEmails.add(email);

      // Mã hóa mật khẩu
      const hashedPassword = await bcrypt.hash(password, 10);

      usersToInsert.push({
        password: hashedPassword,
        email,
        phone,
        role,
        fullname,
        active: active !== undefined ? active : true,
        // Assign school for teachers
        ...(role === 'teacher' && { school: user.school || defaultSchool }),
      });
    }

    // Nếu có lỗi, trả về danh sách lỗi
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Có lỗi trong dữ liệu",
        errors
      });
    }

    // Thêm users vào database
    const createdUsers = await User.insertMany(usersToInsert);

    // Tạo bản ghi Teacher cho các user có role là teacher
    const teachersToCreate = createdUsers
      .filter(user => user.role === 'teacher')
      .map(user => ({
        user: user._id,
        fullname: user.fullname,
        email: user.email,
        subjects: [],
        classes: [],
        school: defaultSchool  // use defaultSchool for required field
      }));

    if (teachersToCreate.length > 0) {
      await Teacher.insertMany(teachersToCreate);
    }

    return res.status(201).json({
      message: `Đã tạo thành công ${createdUsers.length} người dùng`,
      users: createdUsers.map(user => ({
        _id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        fullname: user.fullname,
        active: user.active,
      }))
    });
  } catch (err) {
    console.error('Error in createBatchUsers:', err);
    return res.status(500).json({
      message: "Lỗi khi tạo người dùng",
      error: err.message
    });
  }
};
// Gán thiết bị cho người dùng
exports.getAssignedItems = async (req, res) => {
  try {
    // Kiểm tra nguồn dữ liệu: từ URL (GET) hoặc body (POST)
    const userId = req.params.userId || req.body.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    // Chuyển userId sang ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Kiểm tra user có tồn tại không
    const user = await User.findById(userObjectId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Trả về kết quả (sẽ cần import các model thiết bị)
    /*
    const laptops = await Laptop.find({ assigned: userObjectId }).lean();
    const monitors = await Monitor.find({ assigned: userObjectId }).lean();
    const projectors = await Projector.find({ assigned: userObjectId }).lean();
    const printers = await Printer.find({ assigned: userObjectId }).lean();
    const tools = await Tool.find({ assigned: userObjectId }).lean();

    res.status(200).json({
      message: "Assigned items fetched successfully.",
      items: { laptops, monitors, projectors, printers, tools },
    });
    */
    
    // Tạm thời trả về thông báo
    res.status(200).json({
      message: "Assigned items feature ready - need to implement device models",
      userId: userId,
      user: user.fullname
    });
  } catch (error) {
    console.error("Error fetching assigned items:", error.message);
    res.status(500).json({ message: "Error fetching assigned items.", error });
  }
};

// Cập nhật chấm công
exports.updateAttendance = async (req, res) => {
  try {
    const { employeeCode, attendanceLog } = req.body;

    if (!employeeCode || !attendanceLog || !attendanceLog.length) {
      return res.status(400).json({ message: "Thiếu dữ liệu đầu vào" });
    }

    // Tìm user bằng employeeCode và cập nhật attendanceLog
    const user = await User.findOneAndUpdate(
      { employeeCode },
      { $push: { attendanceLog: { $each: attendanceLog } } },
      { new: true, upsert: false }
    );

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    }

    // Xóa cache user (nếu có Redis)
    // await redisService.deleteUserCache(user._id);

    return res.status(200).json({ message: "Cập nhật chấm công thành công", user });
  } catch (error) {
    console.error("Error updating attendance:", error.message);
    return res.status(500).json({ message: "Lỗi máy chủ.", error: error.message });
  }
};

// Upload avatar hàng loạt
exports.bulkAvatarUpload = async (req, res) => {
  try {
    // Lọc chỉ lấy các file avatar
    const avatarFiles = req.files ? req.files.filter(file => file.fieldname === "avatars") : [];
    
    if (!avatarFiles || avatarFiles.length === 0) {
      return res.status(400).json({ message: "Không có file avatar nào được upload." });
    }

    let updatedCount = 0;
    const errors = [];

    for (const file of avatarFiles) {
      try {
        const originalName = file.originalname;
        const parts = originalName.split("_");
        
        if (parts.length < 2) {
          errors.push(`File ${originalName}: Tên file không đúng định dạng (cần có _)`);
          continue;
        }

        const lastPart = parts[parts.length - 1];
        const employeeCode = lastPart.split(".")[0];

        if (!employeeCode) {
          errors.push(`File ${originalName}: Không tìm thấy mã nhân viên`);
          continue;
        }

        const user = await User.findOneAndUpdate(
          { employeeCode: employeeCode },
          { avatarUrl: `/uploads/Avatar/${file.filename}` },
          { new: true }
        );

        if (user) {
          // Xóa cache user (nếu có Redis)
          // await redisService.deleteUserCache(user._id);
          updatedCount++;
        } else {
          errors.push(`File ${originalName}: Không tìm thấy nhân viên với mã ${employeeCode}`);
        }
      } catch (fileError) {
        errors.push(`File ${file.originalname}: ${fileError.message}`);
      }
    }

    // Xóa cache danh sách users (nếu có Redis)
    // await redisService.deleteAllUsersCache();

    return res.status(200).json({
      message: "Bulk avatar upload hoàn thành",
      updated: updatedCount,
      total: avatarFiles.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Error bulk uploading avatars:", error);
    return res.status(500).json({ 
      message: "Lỗi khi upload avatar hàng loạt", 
      error: error.message 
    });
  }
};

// Lấy danh sách người dùng trong cùng phòng ban
exports.getUsersByDepartment = async (req, res) => {
  try {
    const { department } = req.params;
    
    if (!department) {
      return res.status(400).json({ message: "Department parameter is required" });
    }

    console.log('Fetching users for department:', department);

    const users = await User.find(
      { department },
      "fullname avatarUrl email department role active"
    ).sort({ fullname: 1 });

    res.status(200).json({ 
      department,
      users,
      count: users.length,
      message: "Lấy danh sách nhân viên theo phòng ban thành công"
    });
  } catch (error) {
    console.error("Error fetching department users:", error.message);
    res.status(500).json({ 
      message: "Error fetching department users", 
      error: error.message 
    });
  }
};

// Cập nhật hàng loạt thông tin user
exports.bulkUpdateUsers = async (req, res) => {
  try {
    const { users } = req.body;
    console.log("Dữ liệu nhận được từ frontend:", req.body);

    if (!Array.isArray(users)) {
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ: users phải là mảng",
      });
    }

    const updateResults = [];
    const errors = [];

    // Lặp và cập nhật từng user
    for (const userData of users) {
      try {
        if (!userData.email) {
          errors.push("Email là bắt buộc cho mỗi user");
          continue;
        }

        const updatedUser = await User.findOneAndUpdate(
          { email: userData.email },
          { 
            $set: {
              ...userData,
              updatedAt: Date.now()
            }
          },
          { new: true, upsert: false }
        ).select("-password");

        if (updatedUser) {
          // Xóa cache user (nếu có Redis)
          // await redisService.deleteUserCache(updatedUser._id);
          updateResults.push(updatedUser);
        } else {
          errors.push(`Không tìm thấy user với email: ${userData.email}`);
        }
      } catch (userError) {
        errors.push(`Lỗi cập nhật user ${userData.email}: ${userError.message}`);
      }
    }

    // Xóa cache danh sách users (nếu có Redis)
    // await redisService.deleteAllUsersCache();

    res.json({ 
      message: "Cập nhật hàng loạt hoàn thành!",
      updated: updateResults.length,
      total: users.length,
      errors: errors.length > 0 ? errors : undefined,
      results: updateResults
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật hàng loạt:", error.message);
    res.status(500).json({ 
      message: "Lỗi server", 
      error: error.message 
    });
  }
};

// Thêm vào cuối file hoặc vị trí phù hợp
exports.getCurrentUser = async (req, res) => {
  try {
    // req.user đã được gán bởi middleware authenticateToken
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};