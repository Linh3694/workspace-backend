// backend/config/azure.js
require("dotenv").config();

module.exports = {
  credentials: {
    clientID: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    callbackURL: `https://api-dev.wellspring.edu.vn/api/auth/microsoft/callback`,
    tenantID: process.env.AZURE_TENANT_ID,
  },
};