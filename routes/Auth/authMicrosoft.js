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
    const redirectUri = req.query.redirectUri || "";
    const isMobile    = req.query.mobile === "true";
    const isAdmission = req.query.admission === "true";

    console.log("🔍 [/microsoft] Stateless request:", {
      query: req.query,
      redirectUri,
      isMobile,
      isAdmission,
    });

    // Re‑use incoming state from the mobile app if it exists; otherwise create one
    let rawState = req.query.state;
    if (!rawState) {
      const statePayload = { mobile: isMobile, redirectUri, isAdmission };
      rawState = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
    }

    // Launch Azure AD flow with the (existing or new) state
    passport.authenticate("azuread-openidconnect", { state: rawState })(req, res, next);
  }
);

router.get("/microsoft/callback", (req, res, next) => {
  console.log("🔍 [/callback] Callback received:", {
    query: req.query,
    sessionId: req.sessionID,
    sessionExists: !!req.session,
    hasAuthState: !!(req.session && req.session.authState),
    cookies: req.headers.cookie?.substring(0, 100) + '...' // Log first 100 chars of cookies
  });

  const rawState = req.query.state || "";
  let redirectUri = "";
  let isMobile    = false;
  let isAdmission = false;

  try {
    const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString());
    redirectUri  = parsed.redirectUri || "";
    isMobile     = parsed.mobile === true || parsed.mobile === "true";
    isAdmission  = parsed.isAdmission === true || parsed.isAdmission === "true";
    console.log("✅ [/callback] Parsed state:", { redirectUri, isMobile, isAdmission });
  } catch (err) {
    console.warn("⚠️ [/callback] Unable to parse state:", err);
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
      
      // Nếu FRONTEND_URL không được set hoặc là backend URL, redirect về backend success route với error
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
      console.error("❌ [/callback] Info:", info);
      
      // If session state was lost, redirect to login with a specific error
      if (!redirectUri && !isMobile) {
        console.log("🌐 [NO_USER] Session lost - redirecting to web login");
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        // Nếu FRONTEND_URL không được set hoặc là backend URL, redirect về backend success route với error
        if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
          const mobileParam = isMobile ? "&mobile=true" : "";
          const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
          return res.redirect(`/api/auth/microsoft/success?error=Session+expired+please+try+again${mobileParam}${redirectParam}`);
        } else {
          return res.redirect(`${frontendUrl}/login?error=Session+expired+please+try+again`);
        }
      }
      
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        console.log("📱 [NO_USER] Redirecting to mobile app with error");
        return res.redirect(`${redirectUri}?error=Authentication+failed`);
      }
      console.log("🌐 [NO_USER] Redirecting to web with error");
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      // Nếu FRONTEND_URL không được set hoặc là backend URL, redirect về backend success route với error
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        return res.redirect(`/api/auth/microsoft/success?error=Authentication+failed`);
      } else {
        return res.redirect(`${frontendUrl}/login?error=Authentication+failed`);
      }
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
        isStaffPortalScheme: redirectUri ? redirectUri.startsWith('staffportal://') : false,
        userAgent: req.headers['user-agent']
      });

      // 1. Ưu tiên mobile app redirect nếu có isMobile=true hoặc redirectUri là staffportal scheme
      if (isMobile || (redirectUri && redirectUri.startsWith('staffportal://'))) {
        console.log("📱 [SUCCESS] Mobile detected in callback, redirecting to mobile app");
        
        if (redirectUri && redirectUri.startsWith('staffportal://')) {
          // Sử dụng chính xác redirectUri mà mobile app gửi
          console.log("📱 [SUCCESS] Using exact mobile redirectUri from callback:", `${redirectUri}?token=${token}`);
          res.writeHead(302, { 'Location': `${redirectUri}?token=${token}` });
          return res.end();
        } else if (isMobile) {
          // Fallback nếu chỉ có isMobile=true mà không có redirectUri
          console.log("📱 [SUCCESS] Mobile flag detected in callback, using default mobile redirect scheme");
          const defaultMobileRedirectUri = 'staffportal://auth/success';
          res.writeHead(302, { 'Location': `${defaultMobileRedirectUri}?token=${token}` });
          return res.end();
        }
      }

      // Nếu từ web hoặc không có valid mobile redirect, chuyển hướng về frontend
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const admissionQuery = isAdmission ? "&admission=true" : "";
      
      // Nếu FRONTEND_URL không được set hoặc là backend URL, redirect về backend success route
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        const mobileParam = isMobile ? "&mobile=true" : "";
        const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
        const webRedirectUrl = `/api/auth/microsoft/success?token=${token}${admissionQuery}${mobileParam}${redirectParam}`;
        console.log("🌐 [SUCCESS] Redirecting to backend success route:", webRedirectUrl);
        return res.redirect(webRedirectUrl);
      } else {
        const webRedirectUrl = `${frontendUrl}/auth/microsoft/success?token=${token}${admissionQuery}`;
        console.log("🌐 [SUCCESS] Redirecting to frontend:", webRedirectUrl);
        return res.redirect(webRedirectUrl);
      }
      
    } catch (error) {
      console.error("❌ [/callback] Error creating JWT:", error);
      if (isMobile && redirectUri && redirectUri.startsWith('staffportal://')) {
        return res.redirect(`${redirectUri}?error=${encodeURIComponent(error.message)}`);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      // Nếu FRONTEND_URL không được set hoặc là backend URL, redirect về backend success route với error
      if (!process.env.FRONTEND_URL || frontendUrl.includes('api-dev.wellspring.edu.vn')) {
        const mobileParam = isMobile ? "&mobile=true" : "";
        const redirectParam = redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : "";
        return res.redirect(`/api/auth/microsoft/success?error=${encodeURIComponent(error.message)}${mobileParam}${redirectParam}`);
      } else {
        return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
      }
    }
  };

  // Use passport authenticate with custom callback
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

    // 1. Ưu tiên mobile app redirect nếu có mobile === "true"=true hoặc redirectUri là staffportal scheme
    if (mobile || (redirectUri && redirectUri.startsWith('staffportal://'))) {
      console.log("📱 [SUCCESS] Mobile detected in callback, redirecting to mobile app");
      
      if (redirectUri && redirectUri.startsWith('staffportal://')) {
        // Sử dụng chính xác redirectUri mà mobile app gửi
        console.log("📱 [SUCCESS] Using exact mobile redirectUri from callback:", `${redirectUri}?token=${token}`);
        res.writeHead(302, { 'Location': `${redirectUri}?token=${token}` });
        return res.end();
      } else if (mobile) {
        // Fallback nếu chỉ có isMobile=true mà không có redirectUri
        console.log("📱 [SUCCESS] Mobile flag detected in callback, using default mobile redirect scheme");
        const defaultMobileRedirectUri = 'staffportal://auth/success';
        res.writeHead(302, { 'Location': `${defaultMobileRedirectUri}?token=${token}` });
        return res.end();
      }
    }

    // 2. Nếu có frontend URL riêng, redirect về frontend
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('api-dev.wellspring.edu.vn')) {
      const dashboardUrl = admission === "true" 
        ? `${frontendUrl}/dashboard?admission=true&token=${token}` 
        : `${frontendUrl}/dashboard?token=${token}`;
      
      console.log("🌐 [SUCCESS] Redirecting to frontend:", dashboardUrl);
      return res.redirect(dashboardUrl);
    }

    // 4. Nếu không có frontend URL, trả về JSON response như login thông thường
    console.log("📊 [SUCCESS] Returning JSON response");
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

module.exports = router;