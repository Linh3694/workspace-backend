/**
 * routes/Auth/authApple.js
 * Apple Authentication endpoint for iOS Sign in with Apple
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../models/Users');

const router = express.Router();

router.post('/apple/login', async (req, res) => {
  try {
    const { identityToken, user: appleUserId, email, fullName } = req.body;
    
    if (!identityToken || !appleUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Identity token and user ID are required' 
      });
    }

    console.log('🍎 Apple login attempt for user:', appleUserId);

    // Decode JWT token without verification (for development)
    // In production, you should verify the token signature with Apple's public key
    const decoded = jwt.decode(identityToken);
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid identity token format' 
      });
    }
    // Extract email from token or request body
    const userEmail = decoded.email || email;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'No email found in Apple authentication'
      });
    }

    // Check if user exists in database by Apple ID or email
    let user = await User.findOne({ 
      $or: [
        { appleId: appleUserId },
        { email: userEmail.toLowerCase() }
      ]
    });

    if (user) {
      // User exists - update Apple ID if not set
      if (!user.appleId) {
        user.appleId = appleUserId;
        user.provider = user.provider ? `${user.provider},apple` : 'apple';
        await user.save();
        console.log('✅ Updated existing user with Apple ID');
      }

      // Generate JWT token for our system
      const systemToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        message: 'Apple user logged in successfully',
        token: systemToken,
        user: {
          _id: user._id,
          email: user.email,
          fullname: user.fullname,
          role: user.role,
          department: user.department,
          jobTitle: user.jobTitle,
          employeeCode: user.employeeCode,
          avatarUrl: user.avatarUrl,
          provider: user.provider,
          isNewUser: false
        }
      });
    } else {
      // User doesn't exist - return error
      console.log('❌ User not found for Apple ID:', appleUserId);
      
      return res.status(401).json({
        success: false,
        message: 'Tài khoản chưa đăng ký'
      });
    }
    
  } catch (error) {
    console.error('❌ Error in Apple login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router; 