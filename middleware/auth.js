const jwt = require("jsonwebtoken");
const User = require("../models/Users");

// Middleware xác thực token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization header missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "default_secret";
    const decoded = jwt.verify(token, secret);

    // Support both token formats: 
    // - Web app uses 'id' field
    // - Parent portal uses 'userId' field
    const userId = decoded.id || decoded.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Invalid token structure" });
    }

    // Fetch user data from database
    const user = await User.findById(userId).select("fullname email role needProfileUpdate jobTitle department employeeCode");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = {
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      needProfileUpdate: user.needProfileUpdate,
      jobTitle: user.jobTitle,
      department: user.department,
      employeeCode: user.employeeCode,
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Middleware kiểm tra quyền admin
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. Admin role required." });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  isAdmin
}; 