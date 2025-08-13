import * as dotenv from 'dotenv';
import * as Joi from 'joi';
import { MatchmakerConfig } from '../types';

dotenv.config();

const configSchema = Joi.object({
  HttpPort: Joi.number().port().default(80),
  UseHTTPS: Joi.boolean().default(false),
  MatchmakerPort: Joi.number().port().default(9999),
  LogToFile: Joi.boolean().default(true),
  EnableWebserver: Joi.boolean().default(true),
  RedisUrl: Joi.string().uri().optional(),
  DatabaseUrl: Joi.string().uri().optional(),
  JwtSecret: Joi.string().min(32).default('your-super-secret-jwt-key-change-this-in-production'),
  RateLimitWindowMs: Joi.number().positive().default(15 * 60 * 1000), // 15 minutes
  RateLimitMaxRequests: Joi.number().positive().default(100),
  SessionTimeoutMs: Joi.number().positive().default(30 * 60 * 1000), // 30 minutes
  HealthCheckIntervalMs: Joi.number().positive().default(30 * 1000), // 30 seconds
  AdminDashboardPort: Joi.number().port().default(3001),
});

export function loadConfig(): MatchmakerConfig {
  const envConfig = {
    HttpPort: parseInt(process.env.HTTP_PORT || '80'),
    UseHTTPS: process.env.USE_HTTPS === 'true',
    MatchmakerPort: parseInt(process.env.MATCHMAKER_PORT || '9999'),
    LogToFile: process.env.LOG_TO_FILE !== 'false',
    EnableWebserver: process.env.ENABLE_WEBSERVER !== 'false',
    RedisUrl: process.env.REDIS_URL,
    DatabaseUrl: process.env.DATABASE_URL,
    JwtSecret: process.env.JWT_SECRET,
    RateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    RateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    SessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '1800000'),
    HealthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000'),
    AdminDashboardPort: parseInt(process.env.ADMIN_DASHBOARD_PORT || '3001'),
  };

  const { error, value } = configSchema.validate(envConfig);
  
  if (error) {
    throw new Error(`Configuration validation error: ${error.details[0].message}`);
  }

  return value as MatchmakerConfig;
}

export const config = loadConfig();