const jwt = require('jsonwebtoken');
const config = require('./config');

const generateToken = (siteId, userName = 'Anonymous', roomId = null) => {
  const payload = {
    site_id: siteId,
    user_name: userName,
    room_id: roomId,
  };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_ACCESS_EXPIRY });
};

const verifyToken = (token) => {
  if (!token) return null;
  try {
    const tokenStr = token.startsWith('Bearer ') ? token.slice(7) : token;
    return jwt.verify(tokenStr, config.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization || req.query.token;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized or invalid JWT token' });
  }
  req.user = payload;
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  requireAuth
};
