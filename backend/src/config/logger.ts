// src/config/logger.ts — logs go to stdout/stderr only. Standing rule: nothing
// is written to the app server's disk; the platform (Docker / ECS / CloudWatch)
// collects and retains the stream (CERT-In: keep 180 days, Rulebook C-43).
import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;
const production = process.env.NODE_ENV === 'production';

const readable = printf(({ level, message, timestamp, stack }) => `${timestamp} [${level}]: ${stack || message}`);

export const logger = winston.createLogger({
  level: production ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true })),
  transports: [
    new winston.transports.Console({
      // One JSON object per line in production, for the log collector
      format: production ? json() : combine(colorize(), readable),
    }),
  ],
});
