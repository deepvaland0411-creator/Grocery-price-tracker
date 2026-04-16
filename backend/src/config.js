const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

module.exports = {
  port: Number(process.env.PORT || 5000),
  mongodbUri:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/grocery_tracker",
  corsOrigin: process.env.CORS_ORIGIN || "http://127.0.0.1:5500",

  /** SMTP (optional). If SMTP_HOST is unset, reply emails are skipped. */
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  /** e.g. "GroceryTracker <noreply@yourdomain.com>" */
  mailFrom: process.env.MAIL_FROM || "",

  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
};
