// backend/routes/authMicrosoft.js
const express = require("express");
const passport = require("passport");
const { OIDCStrategy } = require("passport-azure-ad");
const jwt = require("jsonwebtoken");
const User = require("../../models/Users");
const router = express.Router();
const redisService = require('../../services/redisService');
const { Buffer } = require('buffer');

const azureConfig = require("../../config/azure");

// Đã chuyển mobileAuthTokens sang Redis, không dùng Map nữa
// --- Mobile Auth Redis Helpers -------------------------------------------------
/**
 * Lưu session mobile auth vào Redis với TTL (giây)
 */
async function saveMobileAuthSession(sessionId, data, ttlSeconds = 300) {
  await redisService.setMobileAuthSession(sessionId, data, ttlSeconds);
}

/**
 * Lấy session mobile auth từ Redis
 */
async function getMobileAuthSession(sessionId) {
  return await redisService.getMobileAuthSession(sessionId);
}

/**
 * Xoá session mobile auth khỏi Redis
 */
async function deleteMobileAuthSession(sessionId) {
  await redisService.deleteMobileAuthSession(sessionId);
}

/**
 * Xoá tất cả session mobile auth khỏi Redis (debug/dev)
 */
async function deleteAllMobileAuthSessions() {
  return await redisService.deleteAllMobileAuthSessions();
}
// --- Microsoft Callback Helpers ------------------------------------------------
/**
 * Helper: Parse state from rawState param
 */
function parseMicrosoftCallbackState(rawState, req) {
  let redirectUri = "";
  let isMobile    = false;
  let isAdmission = false;
  try {
    let parsed;
    try {
      parsed = JSON.parse(decodeURIComponent(rawState));
    } catch (urlDecodeError) {
      parsed = JSON.parse(base64UrlDecode(rawState));
    }
    redirectUri  = parsed.redirectUri || "";
    isMobile     = parsed.mobile === true || parsed.mobile === "true";
    isAdmission  = parsed.isAdmission === true || parsed.isAdmission === "true";
  } catch (err) {
    // FALLBACK: Detect mobile từ User-Agent nếu state parsing thất bại
    const userAgent = req.headers['user-agent'] || '';
    isMobile = userAgent.includes('Mobile') &&
               (userAgent.includes('iPhone') || userAgent.includes('Android'));
  }
  return { redirectUri, isMobile, isAdmission };
}

/**
 * Helper: Tạo JWT token cho user
 */
function createJwtToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "365d" }
  );
}

/**
 * Helper: Chuẩn bị userData trả về cho mobile/web
 */
function buildUserData(user) {
  return {
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
}

/**
 * Helper: Tạo sessionId cho mobile auth
 */
function generateMobileSessionId() {
  return `mobile_auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// --- helpers ----------------------------------------------------------
/**
 * Encode UTF‑8 string -> Base64URL (RFC 4648 §5)
 */
function base64UrlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode Base64URL -> UTF‑8 string
 */
function base64UrlDecode(b64url) {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "="; // pad
  return Buffer.from(base64, "base64").toString("utf8");
}
// ----------------------------------------------------------------------

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
router.get("/microsoft",
  (req, res, next) => {
    // Remove extraction of redirectUri, isMobile, isAdmission from req.query
    // Remove related console.log

    // Use only the provided state, or default to empty JSON object
    let rawState = req.query.state;
    if (!rawState) {
      // If no state provided, default to an empty JSON object
      rawState = base64UrlEncode(JSON.stringify({ mobile: false, redirectUri: "", isAdmission: false }));
    }

    // Call passport.authenticate with only state
    passport.authenticate("azuread-openidconnect", { state: rawState })(req, res, next);
  }
);

router.get("/microsoft/callback", (req, res, next) => {
  console.log("🔍 [/callback] Callback received:", {
    query: req.query,
    sessionId: req.sessionID,
    sessionExists: !!req.session,
    hasAuthState: !!(req.session && req.session.authState),
    cookies: req.headers.cookie?.substring(0, 100) + '...'
  });

  const rawState = req.query.state || "";
  const { redirectUri, isMobile, isAdmission } = parseMicrosoftCallbackState(rawState, req);
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

    // --- Handle error cases ---
    if (err) {
      console.error("❌ [/callback] Microsoft OAuth error:", err);
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        return res.redirect(`${redirectUri}?error=${encodeURIComponent(err.message)}`);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        const mobileParam = isMobile ? "&mobile=true" : "";
        const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
        return res.redirect(`/api/auth/microsoft/success?error=${encodeURIComponent(err.message)}${mobileParam}${redirectParam}`);
      } else {
        return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(err.message)}`);
      }
    }
    if (!user) {
      console.error("❌ [/callback] No user found after authentication");
      if (!redirectUri && !isMobile) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
          const mobileParam = isMobile ? "&mobile=true" : "";
          const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
          return res.redirect(`/api/auth/microsoft/success?error=Session+expired+please+try+again${mobileParam}${redirectParam}`);
        } else {
          return res.redirect(`${frontendUrl}/login?error=Session+expired+please+try+again`);
        }
      }
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        return res.redirect(`${redirectUri}?error=Authentication+failed`);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        return res.redirect(`/api/auth/microsoft/success?error=Authentication+failed`);
      } else {
        return res.redirect(`${frontendUrl}/login?error=Authentication+failed`);
      }
    }

    // --- Handle success ---
    try {
      const token = createJwtToken(user);
      // Save token/user in Redis (non-blocking)
      redisService.setAuthToken(user._id, token).catch(() => {});
      redisService.setUserData(user._id, user).catch(() => {});

      // 1. Mobile deep link redirect
      if (redirectUri && redirectUri.startsWith('staffportal://')) {
        return res.redirect(`${redirectUri}?token=${token}`);
      }

      // 2. Mobile app session (polling)
      const isMobileUserAgent = req.headers['user-agent'] &&
        req.headers['user-agent'].includes('Mobile') &&
        (req.headers['user-agent'].includes('iPhone') || req.headers['user-agent'].includes('Android'));
      if (isMobile === true || isMobileUserAgent) {
        const sessionId = generateMobileSessionId();
        const userData = buildUserData(user);
        const sessionData = {
          token,
          userData,
          timestamp: Date.now(),
          expires: Date.now() + (5 * 60 * 1000)
        };
        await saveMobileAuthSession(sessionId, sessionData, 300);
        // Prefer deep‑linking straight back to the app so that the in‑app
        // browser (SFSafariView / Chrome Custom Tab) closes immediately.
        if (redirectUri && redirectUri.startsWith('staffportal://')) {
          return res.redirect(`${redirectUri}?sessionId=${sessionId}`);
        }

        // Fallback deep link if redirectUri is missing (should rarely happen)
        return res.redirect(`staffportal://auth/success?sessionId=${sessionId}`);
      }

      // 3. Web/Frontend redirect
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const admissionQuery = isAdmission ? "&admission=true" : "";
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        const mobileParam = isMobile ? "&mobile=true" : "";
        const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
        const webRedirectUrl = `/api/auth/microsoft/success?token=${token}${admissionQuery}${mobileParam}${redirectParam}`;
        return res.redirect(webRedirectUrl);
      } else {
        const webRedirectUrl = `${frontendUrl}/auth/microsoft/success?token=${token}${admissionQuery}`;
        return res.redirect(webRedirectUrl);
      }
    } catch (error) {
      console.error("❌ [/callback] Error creating JWT:", error);
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        return res.redirect(`${redirectUri}?error=${encodeURIComponent(error.message)}`);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        const mobileParam = isMobile ? "&mobile=true" : "";
        const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
        return res.redirect(`/api/auth/microsoft/success?error=${encodeURIComponent(error.message)}${mobileParam}${redirectParam}`);
      } else {
        return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
      }
    }
  };

  passport.authenticate("azuread-openidconnect", handleAuthResult)(req, res, next);
});

// Route để handle success redirect từ Microsoft auth
router.get("/microsoft/success", async (req, res) => {
  const token = req.query.token;
  const error = req.query.error;
  const admission = req.query.admission;
  const mobile = req.query.mobile;
  const redirectUri = req.query.redirectUri;

  console.log("🔍 [/microsoft/success] Success route called:", {
    hasToken: !!token,
    hasError: !!error,
    admission: admission,
    mobile: mobile,
    redirectUri: redirectUri,
    query: req.query,
    allQueryKeys: Object.keys(req.query),
    userAgent: req.headers['user-agent'],
    originalUrl: req.originalUrl,
    fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl
  });

  console.log("🔍 [/microsoft/success] Mobile detection:", {
    mobile: mobile,
    mobileType: typeof mobile,
    mobileEquals: mobile === "true",
    redirectUri: redirectUri,
    redirectUriType: typeof redirectUri,
    redirectUriStartsWith: redirectUri ? redirectUri.startsWith('staffportal://') : false
  });

  if (error) {
    // Nếu là mobile app, redirect về mobile với error
    if (mobile === "true" && redirectUri && redirectUri.startsWith('staffportal://')) {
      console.log("📱 [ERROR] Redirecting to mobile app with error");
      return res.redirect(`${redirectUri}?error=${encodeURIComponent(error)}`);
    }
    
    // Nếu có frontend URL, redirect về đó
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('api-dev.wellspring.edu.vn')) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
    }
    
    // Nếu không, trả về JSON error
    return res.status(400).json({ 
      success: false, 
      message: error,
      error: error 
    });
  }

  if (!token) {
    // Nếu là mobile app, redirect về mobile với error
    if (mobile === "true" && redirectUri && redirectUri.startsWith('staffportal://')) {
      console.log("📱 [ERROR] Redirecting to mobile app with no token error");
      return res.redirect(`${redirectUri}?error=No+token+provided`);
    }
    
    // Nếu có frontend URL, redirect về đó
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('api-dev.wellspring.edu.vn')) {
      return res.redirect(`${frontendUrl}/login?error=No+token+provided`);
    }
    
    // Nếu không, trả về JSON error
    return res.status(400).json({ 
      success: false, 
      message: "No token provided" 
    });
  }

  try {
    // Giải mã token để lấy user info
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    
    // Lấy user data từ database
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Chuẩn bị user data giống như login thông thường
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

    console.log("✅ [/microsoft/success] Auth success, deciding redirect:", { 
      mobile, 
      redirectUri, 
      hasToken: !!token,
      isStaffPortalScheme: redirectUri ? redirectUri.startsWith('staffportal://') : false,
      userAgent: req.headers['user-agent']
    });

    // BACKUP: Detect mobile từ User-Agent nếu mobile parameters không có
    const isMobileUserAgent = req.headers['user-agent'] && 
      req.headers['user-agent'].includes('Mobile') && 
      (req.headers['user-agent'].includes('iPhone') || req.headers['user-agent'].includes('Android'));
    
    console.log("🔍 [/microsoft/success] Mobile detection backup:", {
      isMobileUserAgent,
      originalMobile: mobile,
      userAgent: req.headers['user-agent']?.substring(0, 100)
    });

    // 1. LUÔN ưu tiên mobile app redirect nếu có redirectUri là staffportal scheme
    if (redirectUri && redirectUri.startsWith('staffportal://')) {
      console.log("📱 [SUCCESS] Staffportal scheme detected, redirecting to mobile app");
      return res.redirect(`${redirectUri}?token=${token}`);
    }

    // 2. Hoặc nếu có mobile === "true" HOẶC detect được mobile từ User-Agent
    if (mobile === "true" || isMobileUserAgent) {
      console.log("📱 [SUCCESS] Mobile detected (flag or User-Agent), creating sessionId for mobile app");
      
      // Tạo sessionId để mobile app poll token
      const sessionId = `mobile_auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Lưu token với sessionId trong memory (expire sau 5 phút)
      mobileAuthTokens.set(sessionId, {
        token,
        userData,
        timestamp: Date.now(),
        expires: Date.now() + (5 * 60 * 1000) // 5 minutes
      });
      
      // Clean up expired tokens
      for (const [key, value] of mobileAuthTokens.entries()) {
        if (Date.now() > value.expires) {
          mobileAuthTokens.delete(key);
        }
      }
      
      console.log("📱 [SUCCESS] Token saved with sessionId:", sessionId);
      
      // ALWAYS redirect to web success page instead of trying URL scheme
      const baseUrl = req.protocol + '://' + req.get('host');
      const mobileSuccessUrl = `${baseUrl}/api/auth/microsoft/mobile-success?sessionId=${sessionId}`;
      console.log("📱 [SUCCESS] Redirecting to mobile success page:", mobileSuccessUrl);
      return res.redirect(mobileSuccessUrl);
    }

    // 3. Nếu có frontend URL riêng, redirect về frontend
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('api-dev.wellspring.edu.vn')) {
      const dashboardUrl = admission === "true" 
        ? `${frontendUrl}/dashboard?admission=true&token=${token}` 
        : `${frontendUrl}/dashboard?token=${token}`;
      
      console.log("🌐 [SUCCESS] Redirecting to frontend:", dashboardUrl);
      return res.redirect(dashboardUrl);
    }

    // 4. Chỉ trả JSON nếu không có cách nào khác (fallback cuối cùng)
    console.log("📊 [SUCCESS] No redirect options found, returning JSON response as last resort");
    return res.status(200).json({
      message: "Đăng nhập Microsoft thành công!",
      token,
      user: userData,
      admission: admission === "true"
    });

  } catch (jwtError) {
    console.error("❌ [/microsoft/success] Invalid token:", jwtError);
    
    // Nếu là mobile app, redirect về mobile với error
    if (mobile === "true" && redirectUri && redirectUri.startsWith('staffportal://')) {
      console.log("📱 [ERROR] Redirecting to mobile app with invalid token error");
      return res.redirect(`${redirectUri}?error=Invalid+token`);
    }
    
    // Nếu có frontend URL, redirect về đó
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('api-dev.wellspring.edu.vn')) {
      return res.redirect(`${frontendUrl}/login?error=Invalid+token`);
    }
    
    // Nếu không, trả về JSON error
    return res.status(400).json({ 
      success: false, 
      message: "Invalid token",
      error: jwtError.message 
    });
  }
});

// Route để hiển thị trang thành công cho mobile (thay vì deep link)
router.get("/microsoft/mobile-success", async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).send(`
      <html>
        <head>
          <title>Lỗi xác thực</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ Lỗi xác thực</h2>
          <p>Không tìm thấy session. Vui lòng thử lại.</p>
        </body>
      </html>
    `);
  }
  
  // Lấy session từ Redis
  const authData = await getMobileAuthSession(sessionId);
  if (!authData) {
    // Fallback: tìm recent session (within 30s)
    // Redis không hỗ trợ search by timestamp, nên bỏ fallback này hoặc có thể implement nếu cần
    return res.status(404).send(`
      <html>
        <head>
          <title>Session hết hạn</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>⏰ Session hết hạn</h2>
          <p>Session xác thực đã hết hạn. Vui lòng đóng trang này và thử lại từ ứng dụng.</p>
          <p><small>Debug: SessionId không tìm thấy trong Redis</small></p>
          <p><small>Requested: ${sessionId}</small></p>
        </body>
      </html>
    `);
  }
  // Check if expired (shouldn't happen if TTL của Redis đúng)
  if (authData.expires && Date.now() > authData.expires) {
    await deleteMobileAuthSession(sessionId);
    return res.status(404).send(`
      <html>
        <head>
          <title>Session hết hạn</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>⏰ Session hết hạn</h2>
          <p>Session xác thực đã hết hạn. Vui lòng đóng trang này và thử lại từ ứng dụng.</p>
          <p><small>Debug: Session đã expire</small></p>
        </body>
      </html>
    `);
  }
  // Show success page
  res.send(`
    <html>
      <head>
        <title>Đăng nhập thành công</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .container {
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          }
          .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h2 {
            margin: 0 0 20px 0;
            font-size: 24px;
          }
          p {
            font-size: 16px;
            line-height: 1.6;
            margin: 10px 0;
          }
          .instruction {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
          }
          .open-app-btn {
            background: #4CAF50;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 25px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            margin: 20px 0;
            text-decoration: none;
            display: inline-block;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
          }
          .open-app-btn:hover {
            background: #45a049;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
          }
          .debug {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h2>Đăng nhập Microsoft thành công!</h2>
          <p>Bạn đã được xác thực thành công.</p>
          <a href="staffportal://auth/success?sessionId=${sessionId}" class="open-app-btn">
            🚀 Mở ứng dụng Wiswork
          </a>
          <div class="instruction">
            <p><strong>Hướng dẫn:</strong></p>
            <p>1. Nhấn nút "Mở ứng dụng" ở trên</p>
            <p>2. Hoặc mở ứng dụng Wiswork thủ công</p>
            <p>3. Ứng dụng sẽ tự động đăng nhập</p>
          </div>
          <div class="debug">
            <p>SessionId: ${sessionId}</p>
            <p>Time: ${new Date().toISOString()}</p>
          </div>
        </div>
        <script>
          setTimeout(function() {
            try {
              window.location.href = 'staffportal://auth/success?sessionId=${sessionId}';
            } catch (e) {}
          }, 2000);
          setTimeout(function() {
            try { window.close(); } catch (e) {}
          }, 30000);
        </script>
      </body>
    </html>
  `);
});

// API endpoint: mobile app poll token bằng sessionId (Redis)
router.get("/microsoft/poll-token/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  // Optional: maxAttempts, interval
  let maxAttempts = parseInt(req.query.maxAttempts) || 20;
  let interval = parseInt(req.query.interval) || 1000;
  if (isNaN(maxAttempts) || maxAttempts < 1) maxAttempts = 20;
  if (isNaN(interval) || interval < 100) interval = 1000;

  if (!sessionId) {
    return res.status(400).json({ success: false, message: "SessionId is required" });
  }
  // Polling loop (single attempt, as endpoint is called repeatedly by mobile)
  const authData = await getMobileAuthSession(sessionId);
  if (!authData) {
    return res.status(404).json({ success: false, message: "Session not found or expired" });
  }
  // Check expired
  if (authData.expires && Date.now() > authData.expires) {
    await deleteMobileAuthSession(sessionId);
    return res.status(404).json({ success: false, message: "Session expired" });
  }
  // Remove token sau khi trả về (1 lần)
  await deleteMobileAuthSession(sessionId);
  return res.json({
    success: true,
    token: authData.token,
    user: authData.userData
  });
});

// API endpoint: lấy token mới nhất (không còn fallback vì Redis không hỗ trợ scan theo timestamp)
router.get("/microsoft/poll-latest-token", async (req, res) => {
  // Not supported in Redis version (unless scan keys, which is not recommended for prod)
  // Always return not found
  return res.status(404).json({ success: false, message: "No recent authentication found (not supported in Redis mode)" });
});

// Debug endpoint: test mobile authentication flow (Redis)
router.get("/microsoft/test-mobile", async (req, res) => {
  const sessionId = `test_mobile_auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const testToken = "test_token_123456";
  const testUserData = {
    _id: "test_user_id",
    fullname: "Test User",
    email: "test@wellspring.edu.vn",
    role: "user",
    avatar: null,
    department: "Test Department",
    needProfileUpdate: false,
    jobTitle: "Test Job",
    employeeCode: "TEST001",
  };
  const sessionData = {
    token: testToken,
    userData: testUserData,
    timestamp: Date.now(),
    expires: Date.now() + (5 * 60 * 1000)
  };
  await saveMobileAuthSession(sessionId, sessionData, 300);
  const redirectUrl = `staffportal://auth/success?sessionId=${sessionId}`;
  return res.redirect(redirectUrl);
});

// Debug endpoint: clear all mobile auth sessions in Redis
router.get("/microsoft/debug-clear-all-sessions", async (req, res) => {
  try {
    const deleted = await deleteAllMobileAuthSessions();
    return res.json({ success: true, deleted });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;