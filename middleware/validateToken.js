const jwt = require("jsonwebtoken");
const User = require("../models/Users");

const validateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("🔍 [ValidateToken] Authorization Header:", !!authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ [ValidateToken] Authorization header missing or invalid");
    return res.status(401).json({ message: "Authorization header missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "default_secret";
    const decoded = jwt.verify(token, secret);
    
    console.log('🔍 [ValidateToken] Decoded token:', {
      id: decoded.id,
      role: decoded.role
    });

    // Fetch user data from database for consistency
    try {
      const user = await User.findById(decoded.id).select("fullname email role needProfileUpdate");
      if (!user) {
        console.error('❌ [ValidateToken] User not found with ID:', decoded.id);
        return res.status(404).json({ message: "User not found" });
      }

      req.user = {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        needProfileUpdate: user.needProfileUpdate,
      };
      
      console.log("✅ [ValidateToken] User validated:", {
        id: req.user._id,
        name: req.user.fullname,
        role: req.user.role
      });
      
      next();
    } catch (dbError) {
      console.error('❌ [ValidateToken] Database error:', dbError);
      return res.status(500).json({ message: "Database error during validation" });
    }
  } catch (error) {
    console.error("❌ [ValidateToken] Token validation error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = validateToken;