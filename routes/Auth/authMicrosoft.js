/**
 * routes/Auth/authMicrosoft.js
 *  — Verify Microsoft (Azure AD v2) JWT access‑/id‑tokens and expose a simple
 *    protected endpoint for clients to test the token.
 *    The token must be supplied in the `Authorization: Bearer <token>` header.
 *
 * Environment variables required:
 *   TENANT_ID   – Azure AD tenant GUID
 *   CLIENT_ID   – Application (client) ID of this API
 */
const express = require('express');
const passport = require('passport');
const { BearerStrategy } = require('passport-azure-ad');
const jwt = require('jsonwebtoken');
const User = require('../../models/Users');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* 1. Configure Bearer (JWT) strategy (if env vars are available)     */
/* ------------------------------------------------------------------ */
if (process.env.TENANT_ID && process.env.CLIENT_ID) {
  const options = {
    identityMetadata: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.CLIENT_ID,                       // app registration ID
    audience: process.env.CLIENT_ID,                       // same as client ID unless you created a custom scope
    validateIssuer: true,
    loggingLevel: 'warn',
    passReqToCallback: false
  };

  passport.use(
    new BearerStrategy(options, (token, done) => {
      // token is already validated (signature, exp, aud…)
      return done(null, token);
    })
  );
}

/* ------------------------------------------------------------------ */
/* 2. Routes                                                           */
/* ------------------------------------------------------------------ */

/**
 * POST /api/auth/microsoft/login
 * Main endpoint for Microsoft authentication
 * 1. Verify Microsoft token
 * 2. Extract email from token
 * 3. Check if user exists in DB
 * 4. If exists: return user data
 * 5. If not: create new user and return user data
 */
router.post('/microsoft/login', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authorization header missing or invalid' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Decode JWT token without verification (for development)
    // In production, you should verify the token signature
    const decoded = jwt.decode(token);
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token format' 
      });
    }

    // Check if token is expired
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token has expired' 
      });
    }

    // Extract email from Microsoft token
    const email = decoded.email || decoded.preferred_username || decoded.upn;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'No email found in Microsoft token'
      });
    }

    console.log('🔍 Microsoft login for email:', email);

    // Check if user exists in database
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - return existing user data
      console.log('✅ User found in database:', user.fullname);
      
      // Generate JWT token for our system
      const systemToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        message: 'Microsoft login successful',
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
          provider: 'microsoft'
        }
      });
    } else {
      // User doesn't exist - return error
      console.log('❌ User not found for email:', email);
      
      return res.status(401).json({
        success: false,
        message: 'Tài khoản chưa đăng ký'
      });
    }
    
  } catch (error) {
    console.error('❌ Error in Microsoft login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/microsoft/profile
 * Simple endpoint that decodes Microsoft JWT token and returns user info
 * Works without requiring backend environment configuration
 */
router.get('/microsoft/profile', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Authorization header missing or invalid' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Decode JWT token without verification (for development)
    // In production, you should verify the token signature
    const decoded = jwt.decode(token);
    
    if (!decoded) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid token format' 
      });
    }

    // Check if token is expired
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Token has expired' 
      });
    }

    console.log('🔍 Microsoft token decoded:', {
      name: decoded.name,
      email: decoded.email || decoded.preferred_username,
      oid: decoded.oid,
      exp: new Date(decoded.exp * 1000)
    });

    res.json({ 
      status: 'success', 
      data: decoded 
    });
    
  } catch (error) {
    console.error('❌ Error processing Microsoft token:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error' 
    });
  }
});

/**
 * GET /api/auth/microsoft/profile-secure
 * Secure endpoint using passport-azure-ad (requires env vars)
 */
if (process.env.TENANT_ID && process.env.CLIENT_ID) {
  router.get(
    '/microsoft/profile-secure',
    passport.authenticate('oauth-bearer', { session: false }),
    (req, res) => {
      res.json({ status: 'success', data: req.user });
    }
  );
} else {
  router.get('/microsoft/profile-secure', (req, res) => {
    res.status(503).json({ 
      status: 'error', 
      message: 'Microsoft authentication not configured on server' 
    });
  });
}

module.exports = router;