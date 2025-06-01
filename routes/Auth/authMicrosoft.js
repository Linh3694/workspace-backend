/**
 * routes/Auth/authMicrosoft.js
 *  — Verify Microsoft (Azure AD v2) JWT access‑/id‑tokens and expose a simple
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

const router = express.Router();

/* ------------------------------------------------------------------ */
/* 1. Configure Bearer (JWT) strategy                                  */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* 2. Routes                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/auth/microsoft/profile
 * Simply echoes back the verified token payload so the client knows
 * they’re authenticated.
 */
router.get(
  '/microsoft/profile',
  passport.authenticate('oauth-bearer', { session: false }),
  (req, res) => {
    res.json({ status: 'success', data: req.user });
  }
);

module.exports = router;