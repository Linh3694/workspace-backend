const express = require("express");
const router = express.Router();
const User = require("../../models/Users");
const Student = require("../../models/Students");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { check, validationResult } = require("express-validator");
const mongoose = require("mongoose");
const redisService = require('../../services/redisService');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Kết nối MongoDB thành công!'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));

// 1) LOGIN THỦ CÔNG
router.post(
  "/login",
  [
    check("email")
      .notEmpty().withMessage("Vui lòng nhập email!"),
    check("email")
      .isEmail().withMessage("Email không hợp lệ. Vui lòng kiểm tra."),
    check("password")
      .notEmpty().withMessage("Vui lòng nhập mật khẩu!")
  ],
  async (req, res) => {
    console.log('POST /login called', req.body);
    const errors = validationResult(req);
    console.log('Sau validationResult');
    if (!errors.isEmpty()) {
      console.log('Có lỗi validate:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    console.log('Sau kiểm tra errors');

    const { email, password } = req.body;
    console.log('Email:', email, 'Password:', password);

    try {
      console.log('Bắt đầu xử lý login');
      // Tìm kiếm user theo email
      const user = await User.findOne({ email });
      console.log('Kết quả tìm user:', user);
      if (!user) {
        console.log("Tài khoản không tồn tại trong DB");
        return res.status(404).json({ message: "Tài khoản không tồn tại!" });
      }

      // Kiểm tra mật khẩu
      const isPasswordValid = await bcrypt.compare(password, user.password || "");
      console.log("Mật khẩu nhập:", password);
      console.log("Mật khẩu trong DB:", user.password);
      console.log("Mật khẩu hợp lệ:", isPasswordValid);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Mật khẩu không đúng!" });
      }

      // Tạo token với thời gian hiệu lực 1 ngày
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );

      // Chuẩn bị user data
      const userData = {
        _id: user._id,
        fullname: user.fullname || "N/A",
        email: user.email || "N/A",
        role: user.role || "user",
        avatar: user.avatarUrl,
        department: user.department || "N/A",
        needProfileUpdate: user.needProfileUpdate || false,
        jobTitle: user.jobTitle || "N/A",
        employeeCode: user.employeeCode || "N/A",
      };

      // Lưu vào Redis nếu có thể, nhưng không block luồng chính
      try {
        await redisService.setAuthToken(user._id, token);
        await redisService.setUserData(user._id, userData);
      } catch (redisError) {
        console.warn("Không thể lưu vào Redis:", redisError);
        // Tiếp tục xử lý mà không block
      }

      return res.status(200).json({
        message: "Đăng nhập thành công!",
        token,
        user: userData
      });
    } catch (error) {
      console.error("Lỗi đăng nhập:", error.message);
      return res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }
);

router.post("/verify-id", async (req, res) => {
  const { id } = req.body;

  try {
    // Kiểm tra trong bảng Users
    let user = await User.findOne({ employeeCode: id });

    // Nếu không tìm thấy trong Users, kiểm tra trong Students
    if (!user) {
      user = await Student.findOne({ studentCode: id });
    }

    if (!user) {
      return res.status(404).json({ message: "ID không hợp lệ!" });
    }
    // Lấy tên đầy đủ, avatar, jobTitle, và Klass (nếu có)
    const userId = user._id ? user._id.toString() : user.studentCode || user.employeeCode;
    const fullName = user.fullname || user.name || "N/A";
    const avatarUrl = user.avatar || "https://via.placeholder.com/150";
    const jobTitle = user.jobTitle || "N/A";
    const klass = user.klass || "N/A"; // Klass là lớp học (nếu có)
    const role = user.role || "Không xác đinh";

    // Tạo danh sách tùy chọn tên (đã có logic trước đó)
    const randomUsers = await User.aggregate([{ $sample: { size: 2 } }]);
    const randomStudents = await Student.aggregate([{ $sample: { size: 2 } }]);
    const randomNames = [
      ...randomUsers.map((u) => u.fullname || "Ẩn danh"),
      ...randomStudents.map((s) => s.name || "Ẩn danh"),
    ].filter((name) => name !== fullName);
    const uniqueRandomNames = randomNames.sort(() => 0.5 - Math.random()).slice(0, 2);

    const options = [...uniqueRandomNames, fullName].sort(() => 0.5 - Math.random());

    // Chuẩn bị dữ liệu trả về
    const responseData = {
      userId,
      fullName,
      options,
      employeeCode: user.employeeCode || null,
      studentCode: user.studentCode || null,
      department: user.department || null,
      role: user.role || null,
      avatarUrl,
      jobTitle,
      klass,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error verifying ID:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi!" });
  }
});

// API: Xác thực tên
router.post("/verify-name", async (req, res) => {
  const { userId, fullName, selectedName } = req.body;

  if (!userId || !fullName || !selectedName) {
    return res.status(400).json({ success: false, message: "Thiếu thông tin xác thực!" });
  }

  try {
    console.log("🔍 Đang xác thực tên với dữ liệu:", { userId, fullName, selectedName });
    console.log("📌 Kiểu dữ liệu userId:", typeof userId, " | Giá trị:", userId);
    let user = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(new mongoose.Types.ObjectId(userId));
    }

    // Nếu không tìm thấy trong Users, tìm trong Students
    if (!user) {
      user = await Student.findOne({ _id: userId }) || await Student.findOne({ studentCode: userId });
    }
    if (!user) {
      console.error("❌ Không tìm thấy user với ID:", userId);
      return res.status(400).json({ success: false, message: "ID không hợp lệ!" });
    }
    console.log("✅ User tìm thấy:", user);

    console.log("✅ Tìm thấy user:", user.fullname);

    const normalizedFullName = (user.fullname || user.name || "").trim().toLowerCase();
    const normalizedFullNameInput = fullName.trim().toLowerCase();
    const normalizedSelectedName = selectedName.trim().toLowerCase();

    if (normalizedFullName !== normalizedFullNameInput || normalizedFullNameInput !== normalizedSelectedName) {
      return res.status(400).json({ success: false, message: "Tên không chính xác!" });
    }

    return res.status(200).json({ success: true, message: "Xác thực thành công!" });
  } catch (error) {
    console.error("⚠️ Lỗi xác thực tên:", error);
    return res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

// Thêm route đăng xuất
router.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({ message: "Token không tồn tại" });
    }

    // Giải mã token để lấy user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Xóa token khỏi Redis
    await redisService.deleteAuthToken(userId);

    res.status(200).json({ message: "Đăng xuất thành công" });
  } catch (error) {
    console.error("Lỗi đăng xuất:", error);
    res.status(500).json({ message: "Lỗi server khi đăng xuất" });
  }
});

bcrypt.hash('password', 10).then(console.log);

module.exports = router;