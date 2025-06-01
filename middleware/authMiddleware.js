// backend/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/Users");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    // header: "Bearer <token>"
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No token" });
    }

    // Giải mã token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized - Invalid token" });
    }

    console.log('🔍 [AuthMiddleware] Decoded token:', {
      id: decoded.id,
      role: decoded.role
    });

    // Tìm user trong DB
    const user = await User.findById(decoded.id).select("fullname email role needProfileUpdate");
    if (!user) {
      console.error('❌ [AuthMiddleware] User not found with ID:', decoded.id);
      return res.status(404).json({ message: "User not found" });
    }

    // Gán thông tin user vào req
    req.user = {
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      needProfileUpdate: user.needProfileUpdate,
    };
    console.log("✅ [AuthMiddleware] User authenticated:", {
      id: req.user._id,
      name: req.user.fullname,
      role: req.user.role
    });
    next();
  } catch (error) {
    console.error("❌ [AuthMiddleware] Authentication error:", error);
    res.status(401).json({ message: "Unauthorized", error: error.message });
  }
};

module.exports = authMiddleware;