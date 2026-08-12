require('dotenv').config();

const config = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'crdt-lseq-jwt-secret-key-2026',
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '24h',
  ROOM_CLEANUP_TIMEOUT_MS: 60 * 1000, // 1 minute
  CORS_ORIGINS: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['*'],
};

module.exports = config;
