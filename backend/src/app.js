const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const config = require("./config");
const adminRoutes = require("./routes/admin.routes");
const publicRoutes = require("./routes/public.routes");

const app = express();

const allowedOrigins = [
  config.corsOrigin,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://grocery-price-tracker-coral.vercel.app",
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// Health Route
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "grocery-backend",
  });
});

// Routes
app.use("/api/admin", adminRoutes);
app.use("/api", publicRoutes);

// Error Handler
app.use((err, _req, res, _next) => {
  const message =
    err?.code === 11000
      ? "Duplicate value not allowed"
      : err.message;

  res.status(400).json({
    message: message || "Something went wrong",
  });
});

module.exports = app;