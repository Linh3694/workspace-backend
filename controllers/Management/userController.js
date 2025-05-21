const User = require("../../models/Users"); // Correct import path for User model
const Laptop = require("../../models/Laptop"); // Import model Laptop
const Monitor = require("../../models/Monitor");
const Projector = require("../../models/Projector");
const Printer = require("../../models/Printer");
const Tool = require("../../models/Tool");
const bcrypt = require("bcryptjs"); // Import bcrypt for password hashing

// Gán thiết bị cho người dùng
exports.getAssignedItems = async (req, res) => {
  try {
    // Kiểm tra nguồn dữ liệu: từ URL (GET) hoặc body (POST)
    const userId = req.params.userId || req.body.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    // Chuyển userId sang ObjectId
    const mongoose = require("mongoose");
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Kiểm tra user có tồn tại không
    const user = await User.findById(userObjectId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Truy vấn danh sách thiết bị
    const laptops = await Laptop.find({ assigned: userObjectId }).lean();
    const monitors = await Monitor.find({ assigned: userObjectId }).lean();
    const projectors = await Projector.find({ assigned: userObjectId }).lean();
    const printers = await Printer.find({ assigned: userObjectId }).lean();
    const tools = await Tool.find({ assigned: userObjectId }).lean();

    // Trả về kết quả
    res.status(200).json({
      message: "Assigned items fetched successfully.",
      items: { laptops, monitors, projectors, printers, tools },
    });
  } catch (error) {
    console.error("Error fetching assigned items:", error.message);
    res.status(500).json({ message: "Error fetching assigned items.", error });
  }
};

// Get Users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-password"); // Exclude password for security
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { fullname, email, password, role, employeeCode, avatar, active = false } = req.body;
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const newUser = new User({
      fullname,
      email,
      password: hashedPassword, // Chỉ lưu nếu password được cung cấp
      role,
      employeeCode,
      avatarUrl: avatar,
      active,
    });

    await newUser.save();
    res.status(201).json({ message: "Tạo người dùng thành công", user: newUser });
  } catch (error) {
    console.error("Error creating user:", error.message);
    res.status(500).json({ message: "Server error", error });
  }
};

// Update User
exports.updateUser = async (req, res) => {
  console.log("PUT /users/:id =>", req.params.id);
  try {
    const { id } = req.params;
    const {
      fullname,
      disabled,
      department,
      jobTitle,
      role,
      employeeCode,
      password,
      newPassword,
      email,
      status,
    } = req.body;

    // Tìm user theo id
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Nếu gửi file avatar => cập nhật avatarUrl
    if (req.file) {
      // đường dẫn file do multer lưu
      user.avatarUrl = `/uploads/Avatar/${req.file.filename}`;
    }

    // Cập nhật thông tin cơ bản
    if (fullname) user.fullname = fullname;
    if (email) user.email = email;
    if (department) user.department = department;
    if (jobTitle) user.jobTitle = jobTitle;
    if (role) user.role = role;

    // Kiểm tra trùng mã nhân viên (nếu truyền lên)
    if (employeeCode) {
      const existingUser = await User.findOne({
        employeeCode,
        _id: { $ne: id },
      });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "Mã nhân viên đã tồn tại với người dùng khác." });
      }
      user.employeeCode = employeeCode;
    }

    // disabled: string => boolean
    if (typeof disabled === "string") {
      user.disabled = disabled === "true";
    } else if (typeof disabled === "boolean") {
      user.disabled = disabled;
    }

    // Nếu có newPassword => hash
    if (newPassword) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    } else if (password) {
      // Trường hợp FE vẫn dùng field 'password'
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    console.log("Đã cập nhật user thành công:", user.fullname);

    // Ẩn password
    const userObj = user.toObject();
    delete userObj.password;

    return res.status(200).json(userObj);
  } catch (error) {
    console.error("Error updating user:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// Delete User
exports.deleteUser = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ message: "User deleted successfully!" });
  } catch (error) {
    console.error("Error deleting user:", error.message);
    res.status(400).json({ message: "Error deleting user", error: error.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const { employeeCode, attendanceLog } = req.body;

    if (!employeeCode || !attendanceLog || !attendanceLog.length) {
      return res.status(400).json({ message: "Thiếu dữ liệu đầu vào" });
    }

    // Tìm user bằng employeeCode và cập nhật attendanceLog
    const user = await User.findOneAndUpdate(
      { employeeCode }, // Bộ lọc sử dụng employeeCode
      { $push: { attendanceLog: { $each: attendanceLog } } }, // Thêm attendanceLog mới
      { new: true, upsert: false }
    );

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    }

    return res.status(200).json({ message: "Cập nhật thành công", user });
  } catch (error) {
    console.error("Error updating attendance:", error.message);
    return res.status(500).json({ message: "Lỗi máy chủ.", error: error.message });
  }
};

// Thêm hàm này ở cuối file userController.js (hoặc vị trí thích hợp)
exports.bulkAvatarUpload = async (req, res) => {
  req.files = req.files.filter(file => file.fieldname === "avatars");
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Không có file nào được upload." });
    }

    let updatedCount = 0;

    for (const file of req.files) {
      // Lấy tên gốc khi upload
      const originalName = file.originalname; // ví dụ: "Bùi Quỳnh Mai+_WT02GO.jpeg"

      // Tách chuỗi bằng ký tự '_', phần cuối sẽ là mã nhân viên + extension
      // "Bùi Quỳnh Mai+" / "WT02GO.jpeg"
      const parts = originalName.split("_");
      if (parts.length < 2) {
        // Nếu không đúng format (không có dấu '_'), thì bỏ qua
        continue;
      }

      // Lấy phần cuối cùng "WT02GO.jpeg"
      const lastPart = parts[parts.length - 1];
      // Tách tiếp để bỏ đuôi .jpeg
      const employeeCode = lastPart.split(".")[0]; // "WT02GO"

      if (!employeeCode) {
        // Nếu không lấy được employeeCode thì bỏ qua
        continue;
      }

      // Tìm user trong DB theo employeeCode
      const user = await User.findOneAndUpdate(
        { employeeCode: employeeCode },
        { avatarUrl: file.filename }, // hoặc bạn muốn lưu cả đường dẫn: `'/uploads/Avatar/' + file.filename`
        { new: true }
      );

      // Nếu update thành công, tăng biến đếm
      if (user) {
        updatedCount++;
      }
    }

    return res.status(200).json({
      message: "Bulk avatar upload thành công",
      updated: updatedCount,
    });
  } catch (error) {
    console.error("Error bulk uploading avatars:", error);
    return res
      .status(500)
      .json({ message: "Lỗi khi upload avatar hàng loạt", error });
  }
};

exports.bulkUpdateUsers = async (req, res) => {
  try {
    const { users } = req.body;
    console.log("Dữ liệu nhận được từ frontend:", req.body);

    if (!Array.isArray(users)) {
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ: users phải là mảng",
      });
    }

    // Lặp và cập nhật
    const updatePromises = users.map(async (user) => {
      if (!user.email) throw new Error("Email là bắt buộc");
      return User.findOneAndUpdate(
        { email: user.email },
        { $set: user },
        { new: true, upsert: false }
      );
    });

    await Promise.all(updatePromises);
    res.json({ message: "Cập nhật thành công!" });
  } catch (error) {
    console.error("Lỗi khi cập nhật:", error.message);
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Query không hợp lệ." });
    }

    const condition = {
      $or: [
        { fullname: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    };

    const users = await User.find(condition, "-password");
    if (users.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy kết quả nào." });
    }
    res.json(users);
  } catch (err) {
    console.error("Error in search API:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id === "me" ? req.user.id : req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user by ID:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};