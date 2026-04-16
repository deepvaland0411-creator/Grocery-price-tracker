/**
 * One-time fix: replace all admin accounts with a single admin using
 * ADMIN_DEFAULT_EMAIL / ADMIN_DEFAULT_PASSWORD from .env (or the same defaults as server.js).
 *
 * Run: npm run reset-admin
 * Stop the backend first if you want to avoid concurrent DB access.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const bcrypt = require("bcryptjs");
const { connectDb } = require("./db");
const Admin = require("./models/admin.model");

const email = (process.env.ADMIN_DEFAULT_EMAIL || "deepvaland0411@gmail.com").toLowerCase();
const password = process.env.ADMIN_DEFAULT_PASSWORD || "deep@0411";

async function main() {
  await connectDb();
  const n = await Admin.countDocuments();
  await Admin.deleteMany({});
  const passwordHash = await bcrypt.hash(password, 10);
  await Admin.create({ email, passwordHash, name: "Admin User" });
  console.log(
    `Done. Removed ${n} old admin(s). You can sign in with:\n  Email: ${email}\n  Password: (from ADMIN_DEFAULT_PASSWORD or default in resetAdmin.js)`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
