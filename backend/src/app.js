const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const config = require("./config");
const adminRoutes = require("./routes/admin.routes");
const publicRoutes = require("./routes/public.routes");

const app = express();

function isDevFrontendOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      origin === config.corsOrigin
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isDevFrontendOrigin(origin)) return callback(null, true);
      callback(null, false);
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "grocery-backend" });
});

app.use("/api/admin", adminRoutes);
app.use("/api", publicRoutes);

app.use((err, _req, res, _next) => {
  const message = err?.code === 11000 ? "Duplicate value not allowed" : err.message;
  res.status(400).json({ message: message || "Something went wrong" });
});

module.exports = app;
