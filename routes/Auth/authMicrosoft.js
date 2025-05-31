// backend/routes/authMicrosoft.js
const express = require("express");
const passport = require("passport");
const { OIDCStrategy } = require("passport-azure-ad");
const jwt = require("jsonwebtoken");
const User = require("../../models/Users");
const router = express.Router();
const redisService = require('../../services/redisService');

const azureConfig = require("../../config/azure");

// Cấu hình passport strategy với OIDCStrategy
passport.use(
  new OIDCStrategy(
    {
      identityMetadata: `https://login.microsoftonline.com/${azureConfig.credentials.tenantID}/v2.0/.well-known/openid-configuration`,
      clientID: azureConfig.credentials.clientID,
      clientSecret: azureConfig.credentials.clientSecret,
      responseType: "code",
      responseMode: "query",
      redirectUrl: azureConfig.credentials.callbackURL,
      allowHttpForRedirectUrl: true,
      passReqToCallback: true,
      scope: ["User.Read", "profile", "email", "openid"],
      loggingLevel: "info",
      validateIssuer: false,
      clockSkew: 300,
      nonceLifetime: 3600,
      nonceMaxAmount: 5,
      useCookieInsteadOfSession: false,
      cookieEncryptionKeys: [
        { 'key': process.env.JWT_SECRET, 'iv': process.env.JWT_SECRET.substring(0, 12) }
      ]
    },
    async (req, iss, sub, profile, accessToken, refreshToken, params, done) => {
      console.log("🔍 [OIDC Strategy] Callback received:", {
        hasReq: !!req,
        hasProfile: !!profile,
        sessionId: req?.sessionID,
        profileEmail: profile?._json?.preferred_username
      });

      if (!profile || !profile._json) {
        console.error("❌ Lỗi: Không nhận được thông tin user từ Microsoft.");
        return done(null, false, { message: "Không nhận được thông tin từ Microsoft" });
      }

      try {
        // Lấy email và tên từ profile trả về từ Microsoft
        const email = profile._json.preferred_username;
        const displayName = profile.displayName || "No name";

        console.log("🔍 [OIDC Strategy] Processing user:", { email, displayName });

        // Kiểm tra xem email đã tồn tại trong database chưa
        let user = await User.findOne({ email });
        if (!user) {
          console.log("🔍 [OIDC Strategy] Creating new user:", email);
          // Nếu chưa tồn tại, tạo mới user với flag needProfileUpdate = true
          user = new User({
            fullname: displayName,
            email,
            password: "", // Vì dùng OAuth nên không cần mật khẩu
            role: "user", // Hoặc giá trị mặc định
            needProfileUpdate: true, // Đánh dấu yêu cầu bổ sung thông tin
          });
          await user.save();

          // Xóa cache danh sách users khi tạo user mới
          await redisService.deleteAllUsersCache();
        } else {
          console.log("🔍 [OIDC Strategy] Found existing user:", email);
        }

        // Lưu thông tin user vào Redis
        await redisService.setUserData(user._id, user);

        console.log("✅ [OIDC Strategy] User processed successfully:", user._id);
        return done(null, user);
      } catch (error) {
        console.error("❌ [OIDC Strategy] Error processing user:", error);
        return done(error, null);
      }
    }
  )
);

// Serialize/Deserialize (nếu dùng session)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    // Kiểm tra cache trước
    let user = await redisService.getUserData(id);
    if (!user) {
      // Nếu không có trong cache, truy vấn database
      user = await User.findById(id);
      if (user) {
        // Lưu vào cache
        await redisService.setUserData(id, user);
      }
    }
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Debug endpoint để test session
router.get("/debug-session", (req, res) => {
  res.json({
    sessionId: req.sessionID,
    session: req.session,
    cookies: req.headers.cookie,
    query: req.query,
    timestamp: new Date().toISOString()
  });
});

// Route bắt đầu flow OAuth với Microsoft
router.get("/microsoft", (req, res, next) => {
  const redirectUri = req.query.redirectUri || "";
  const isMobile = req.query.mobile === "true";
  const isAdmission = req.query.admission === "true";

  console.log("🔍 [/microsoft] Full request details:", {
    query: req.query,
    redirectUri,
    isMobile,
    isAdmission,
    sessionId: req.sessionID,
    sessionExists: !!req.session
  });

  // Ensure session exists before storing data
  if (!req.session) {
    console.error("❌ [/microsoft] No session found!");
    return res.status(500).send("Session error - please try again");
  }

  // Lưu thông tin tùy chỉnh vào session
  req.session.authState = { redirectUri, isMobile, isAdmission };
  
  // Force session save to ensure it persists through OAuth flow
  req.session.save((err) => {
    if (err) {
      console.error("❌ [/microsoft] Session save error:", err);
      return res.status(500).send("Session save error");
    }
    
    console.log("✅ [/microsoft] Session saved successfully:", {
      sessionId: req.sessionID,
      authState: req.session.authState
    });
    
    passport.authenticate("azuread-openidconnect")(req, res, next);
  });
});

router.get("/microsoft/callback", (req, res, next) => {
  console.log("🔍 [/callback] Callback received:", {
    query: req.query,
    sessionId: req.sessionID,
    sessionExists: !!req.session,
    hasAuthState: !!(req.session && req.session.authState),
    cookies: req.headers.cookie?.substring(0, 100) + '...' // Log first 100 chars of cookies
  });

  let redirectUri = "";
  let isMobile = false;
  let isAdmission = false;

  // Lấy thông tin từ session (nếu có)
  if (req.session && req.session.authState) {
    redirectUri = req.session.authState.redirectUri;
    isMobile = req.session.authState.isMobile;
    isAdmission = req.session.authState.isAdmission;
    console.log("✅ [/callback] Found session state:", { redirectUri, isMobile, isAdmission });
    // Xóa sau khi đã lấy để không lộ thông tin lần sau
    delete req.session.authState;
  } else {
    console.warn("⚠️ [/callback] No session state found - this might be due to session store issues");
    console.log("🔍 [/callback] Session debug info:", {
      sessionId: req.sessionID,
      sessionData: req.session,
      cookieHeader: !!req.headers.cookie
    });
    
    // Don't use query params as fallback since they're not available in OAuth callback
    // Instead, we'll redirect to a generic error page
  }

  console.log("🔍 [/callback] Final params:", { redirectUri, isMobile, isAdmission });

  // Custom callback to handle the passport authentication result
  const handleAuthResult = async (err, user, info) => {
    console.log("🔍 [/callback] Passport authenticate result:", {
      hasError: !!err,
      hasUser: !!user,
      info: info,
      isMobile,
      redirectUri
    });

    if (err) {
      console.error("❌ [/callback] Microsoft OAuth error:", err);
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        console.log("📱 [ERROR] Redirecting to mobile app with error");
        return res.redirect(`${redirectUri}?error=${encodeURIComponent(err.message)}`);
      }
      console.log("🌐 [ERROR] Redirecting to web with error");
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(err.message)}`);
    }
    
    if (!user) {
      console.error("❌ [/callback] No user found after authentication");
      console.error("❌ [/callback] Info:", info);
      
      // If session state was lost, redirect to login with a specific error
      if (!redirectUri && !isMobile) {
        console.log("🌐 [NO_USER] Session lost - redirecting to web login");
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=Session+expired+please+try+again`);
      }
      
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        console.log("📱 [NO_USER] Redirecting to mobile app with error");
        return res.redirect(`${redirectUri}?error=Authentication+failed`);
      }
      console.log("🌐 [NO_USER] Redirecting to web with error");
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=Authentication+failed`);
    }

    try {
      // 🔑 Tạo JWT token
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );

      // Lưu token vào Redis nếu có thể, nhưng không block luồng chính
      try {
        await redisService.setAuthToken(user._id, token);
        await redisService.setUserData(user._id, user);
      } catch (redisError) {
        console.warn("Không thể lưu vào Redis:", redisError);
        // Tiếp tục xử lý mà không block
      }

      console.log("✅ [/callback] Auth success, deciding redirect:", { 
        isMobile, 
        redirectUri, 
        hasToken: !!token,
        isStaffPortalScheme: redirectUri ? redirectUri.startsWith('staffportal://') : false
      });

      // Ưu tiên redirect mobile trước (only if valid staffportal scheme)
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        console.log("📱 [SUCCESS] Redirecting to mobile app:", `${redirectUri}?token=${token}`);
        return res.redirect(`${redirectUri}?token=${token}`);
      }

      // Nếu từ web hoặc không có valid mobile redirect, chuyển hướng về frontend
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const admissionQuery = isAdmission ? "&admission=true" : "";
      const webRedirectUrl = `${frontendUrl}/auth/microsoft/success?token=${token}${admissionQuery}`;
      console.log("🌐 [SUCCESS] Redirecting to web:", webRedirectUrl);
      return res.redirect(webRedirectUrl);
      
    } catch (error) {
      console.error("❌ [/callback] Error creating JWT:", error);
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        return res.redirect(`${redirectUri}?error=${encodeURIComponent(error.message)}`);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
    }
  };

  // Use passport authenticate with custom callback
  passport.authenticate("azuread-openidconnect", handleAuthResult)(req, res, next);
});

module.exports = router;