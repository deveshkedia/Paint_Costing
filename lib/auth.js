const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "auth_token";

function requireSecret() {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
}

function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(payload) {
  requireSecret();
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  requireSecret();
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Parses the auth cookie from a Next.js Request (App Router) and returns
 * the decoded user payload, or null if not authenticated.
 */
function getUserFromRequest(request) {
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) return null;
  return verifyToken(cookie.value);
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  getUserFromRequest,
};
