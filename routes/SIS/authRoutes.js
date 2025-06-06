const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/Users');
const Parent = require('../../models/Parent');

// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Kiểm tra username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    // Kiểm tra mật khẩu
    console.log('FE gửi lên:', password);
    console.log('Password trong DB:', user.password);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    // Tạo token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Trả về thông tin user và token
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        fullname: user.fullname,
        role: user.role,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Đăng xuất
router.post('/logout', (req, res) => {
  res.json({ message: 'Đăng xuất thành công' });
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(401).json({ message: 'Token không hợp lệ' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.userId });
    if (!user) {
      return res.status(401).json({ message: 'Người dùng không tồn tại' });
    }

    // Tạo token mới
    const newToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token: newToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
});

// Đăng nhập cho mobile app
router.post('/mobile/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Tìm user theo phone (username)
    const user = await User.findOne({ username: phone });
    if (!user) {
      return res.status(401).json({ message: 'Số điện thoại hoặc mật khẩu không đúng' });
    }

    // Kiểm tra mật khẩu
    console.log('FE gửi lên:', password);
    console.log('Password trong DB:', user.password);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Số điện thoại hoặc mật khẩu không đúng' });
    }

    // Tìm parent theo user._id
    const parent = await Parent.findOne({ user: user._id }).populate('students');
    if (!parent) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin phụ huynh' });
    }

    // Tạo token với thời hạn 10 năm
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '3650d' } // 10 năm
    );

    // Trả về thông tin phụ huynh và token
    res.json({
      token,
      parent: {
        id: parent._id,
        fullname: parent.fullname,
        phone: parent.phone,
        email: parent.email,
        students: parent.students.map(stu => ({
          id: stu._id,
          name: stu.name,
          class: stu.class,
          avatarUrl: stu.avatarUrl
        }))
      }
    });
  } catch (error) {
    console.error('Mobile login error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router; 