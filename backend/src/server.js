const bcrypt = require("bcryptjs");
const app = require("./app");
const config = require("./config");
const { connectDb } = require("./db");
const Admin = require("./models/admin.model");

async function ensureDefaultAdmin() {
  const n = await Admin.countDocuments();
  if (n > 0) return;
  const email = (process.env.ADMIN_DEFAULT_EMAIL || "deepvaland0411@gmail.com").toLowerCase();
  const password = process.env.ADMIN_DEFAULT_PASSWORD || "deep@0411";
  const passwordHash = await bcrypt.hash(password, 10);
  await Admin.create({ email, passwordHash, name: "Admin User" });
  console.log(
    `Default admin created (${email}). Override with ADMIN_DEFAULT_EMAIL / ADMIN_DEFAULT_PASSWORD in .env`
  );
}

async function start() {
  await connectDb();
  await ensureDefaultAdmin();
  app.listen(config.port, () => {
    console.log(`Backend running on http://127.0.0.1:${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
