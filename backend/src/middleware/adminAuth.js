const jwt = require("jsonwebtoken");
const config = require("../config");

/**
 * Requires `Authorization: Bearer <jwt>`. Sets req.adminId from token payload.
 */
function requireAdmin(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const token = h.slice(7);
    const payload = jwt.verify(token, config.jwtSecret);
    req.adminId = payload.sub;
    req.adminEmail = payload.email;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { requireAdmin };
