import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';

import { logger } from './config/logger';
import { connectDB } from './config/database';
import { connectRedis } from './config/redis';
import { startScheduler } from './jobs/scheduler';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productRoutes from './routes/product.routes';
import orderRoutes from './routes/order.routes';
import prescriptionRoutes from './routes/prescription.routes';
import paymentRoutes from './routes/payment.routes';
import inventoryRoutes from './routes/inventory.routes';
import vendorRoutes from './routes/vendor.routes';
import adminRoutes from './routes/admin.routes';
import doctorRoutes from './routes/doctor.routes';
import consultationRoutes from './routes/consultation.routes';
import notificationRoutes from './routes/notification.routes';
import couponRoutes from './routes/coupon.routes';
import reportRoutes from './routes/report.routes';
// v2.0 — compatibility patch routes
import kycRoutes from './routes/kyc.routes';
import cartRoutes from './routes/cart.routes';
import partnerRoutes from './routes/partner.routes';
import refillRoutes from './routes/refill.routes';
import fulfilmentRoutes from './routes/fulfilment.routes';
import invoiceRoutes from './routes/invoice.routes';
import eInvoiceRouter from './controllers/einvoice.controller';

import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Client'],
}));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const limitMessage = (message: string) => ({ success: false, message, error: message });

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many requests. Please try again later.'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'),
  message: limitMessage('Too many auth attempts. Please try again later.'),
});

app.use(globalLimiter);
app.use(compression());
app.use(cookieParser());
// Keep the raw bytes for webhook signature checks (payment.controller handleWebhook)
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'dawabag-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
const api = '/api/v1';

app.use(`${api}/auth`, authLimiter, authRoutes);
app.use(`${api}/users`, userRoutes);
app.use(`${api}/products`, productRoutes);
app.use(`${api}/orders`, orderRoutes);
app.use(`${api}/prescriptions`, prescriptionRoutes);
app.use(`${api}/payments`, paymentRoutes);
app.use(`${api}/inventory`, inventoryRoutes);
app.use(`${api}/vendors`, vendorRoutes);
app.use(`${api}/admin`, adminRoutes);
app.use(`${api}/doctors`, doctorRoutes);
app.use(`${api}/consultations`, consultationRoutes);
app.use(`${api}/notifications`, notificationRoutes);
app.use(`${api}/coupons`, couponRoutes);
app.use(`${api}/reports`, reportRoutes);
// v2.0 routes
app.use(`${api}/kyc`, kycRoutes);
app.use(`${api}/cart`, cartRoutes);
app.use(`${api}/partner`, partnerRoutes);
app.use(`${api}/refills`, refillRoutes);
app.use(`${api}/fulfilment`, fulfilmentRoutes);
app.use(`${api}/invoices`, invoiceRoutes);
app.use(`${api}/einvoice`, eInvoiceRouter);

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Bootstrap ──────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await connectDB();
    logger.info('PostgreSQL connected');

    await connectRedis();
    logger.info('Redis connected');

    startScheduler();

    app.listen(PORT, () => {
      logger.info(`Dawabag API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

export default app;
