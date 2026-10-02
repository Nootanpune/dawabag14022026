import './config/timezone';               // first: the process runs in UTC (see the file)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import 'dotenv/config';

import { logger } from './config/logger';
import { connectDB, getDB } from './config/database';
import { checkEnv } from './config/env';
import { installProcessGuards } from './config/processGuards';
import { connectRedis, getRedis } from './config/redis';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { stopNotificationQueue } from './services/notification.service';
import { stopEinvoiceQueue } from './services/einvoice/einvoice.service';

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
import eprescriptionRoutes from './routes/eprescription.routes';
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
import grievanceRoutes from './routes/grievance.routes';
import legalRoutes from './routes/legal.routes';
import deliveryRoutes from './routes/delivery.routes';
import privacyRoutes from './routes/privacy.routes';
import recallRoutes from './routes/recall.routes';
import returnRoutes from './routes/return.routes';
import complianceRoutes from './routes/compliance.routes';
import catalogueRoutes from './routes/catalogue.routes';
import catalogueDraftRoutes from './routes/catalogueDraft.routes';
import catalogueListRoutes from './routes/catalogueLists.routes';
import accountsRoutes from './routes/accounts.routes';
import purchasingRoutes from './routes/purchasing.routes';
import stockControlRoutes from './routes/stockControl.routes';
import courierRoutes from './routes/courier.routes';
import einvoiceRoutes from './routes/einvoice.routes';
// Sprint 33: medicine information, substitutes, delivery date, trust pages, reminders, health profile
import medicineRoutes from './routes/medicines.routes';
import infoPageRoutes from './routes/infoPages.routes';
import reminderRoutes from './routes/reminders.routes';
import healthProfileRoutes from './routes/healthProfile.routes';

import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestId } from './middleware/requestId';


const app = express();
const PORT = process.env.PORT || 4000;

app.use(requestId);

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',').map((o) => o.trim()),
  credentials: true,
  exposedHeaders: ['X-Request-Id'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Client'],
}));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const limitMessage = (message: string) => ({ success: false, message, error: message });

// Behind a load balancer the client address is in X-Forwarded-For (set TRUST_PROXY_HOPS)
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '0'));

// Signed gateway callbacks are not rate-limited per IP (Razorpay and Shiprocket share addresses)
const WEBHOOKS = ['/api/v1/payments/webhook', '/api/v1/courier/shiprocket/webhook'];
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => WEBHOOKS.includes(req.path),
  message: limitMessage('Too many requests. Please try again later.'),
});

// The public e-prescription check: a code is a bearer of health data (C-41)
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.VERIFY_RATE_LIMIT_MAX || '30'),
  message: limitMessage('Too many prescription checks. Please try again later.'),
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
// Access logs never carry an e-prescription check code
morgan.token('url', (req: express.Request) => (req.originalUrl || req.url).replace(/(\/eprescriptions\/verify\/)[^/?]+/, '$1[code]'));
morgan.token('rid', (req: express.Request) => req.id ?? '-');
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" rid=:rid', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Health checks ──────────────────────────────────────────────────────────
// /health: the process is up (liveness). /ready: it can serve — database and
// Redis answer (load balancer readiness).
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dawabag-api', timestamp: new Date().toISOString() });
});
app.get('/ready', async (_req, res) => {
  const checks: Record<string, string> = {};
  try { await getDB().query('SELECT 1'); checks.database = 'ok'; } catch { checks.database = 'down'; }
  try { checks.redis = (await getRedis().ping()) === 'PONG' ? 'ok' : 'down'; } catch { checks.redis = 'down'; }
  const ok = Object.values(checks).every((v) => v === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks });
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
app.use(`${api}/eprescriptions/verify`, verifyLimiter);   // the public check only
app.use(`${api}/eprescriptions`, eprescriptionRoutes);
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
app.use(`${api}/grievances`, grievanceRoutes);
app.use(`${api}/legal`, legalRoutes);
app.use(`${api}/delivery`, deliveryRoutes);
app.use(`${api}/privacy`, privacyRoutes);
app.use(`${api}/recalls`, recallRoutes);
app.use(`${api}/returns`, returnRoutes);
app.use(`${api}/compliance`, complianceRoutes);
app.use(`${api}/catalogue`, catalogueRoutes);
app.use(`${api}/catalogue-drafts`, catalogueDraftRoutes);   // Sprint 29: new products to complete
app.use(`${api}/catalogue-lists`, catalogueListRoutes);     // Sprint 31: categories and HSN codes
app.use(`${api}/accounts`, accountsRoutes);
app.use(`${api}/purchasing`, purchasingRoutes);
app.use(`${api}/stock`, stockControlRoutes);
app.use(`${api}/courier`, courierRoutes);
app.use(`${api}/einvoices`, einvoiceRoutes);
app.use(`${api}/medicines`, medicineRoutes);             // Sprint 33: product page information
app.use(`${api}/info-pages`, infoPageRoutes);           // Sprint 33: trust pages
app.use(`${api}/reminders`, reminderRoutes);            // Sprint 33: "My medicines" dose reminders
app.use(`${api}/health-profile`, healthProfileRoutes);  // Sprint 33: health profile (consent, C-41)

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Bootstrap ──────────────────────────────────────────────────────────────
// Unhandled rejections: fatal while starting, logged (never a crash) once serving (Sprint 32)
const processGuards = installProcessGuards();

async function bootstrap() {
  try {
    const env = checkEnv();
    env.warnings.forEach((w) => logger.warn(`Config: ${w}`));
    if (env.errors.length) {
      env.errors.forEach((e) => logger.error(`Config: ${e}`));
      throw new Error('Configuration is not valid; see the messages above');
    }

    await connectDB();
    logger.info('PostgreSQL connected');

    await connectRedis();
    logger.info('Redis connected');

    startScheduler();

    const server = app.listen(PORT, () => {
      processGuards.markStarted();
      logger.info(`Dawabag API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
    // A port already in use (or any listen failure) is a startup failure: stop (exit 1)
    server.on('error', (err) => {
      logger.error('Failed to start server:', err);
      process.exit(1);
    });

    // Finish in-flight requests, then close connections (container stop / deploy)
    const shutdown = (signal: string) => {
      logger.info(`${signal} received: shutting down`);
      stopScheduler();
      void stopNotificationQueue();
      void stopEinvoiceQueue();
      server.close(async () => {
        await getDB().end().catch(() => undefined);
        await getRedis().quit().catch(() => undefined);
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 15_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

export default app;
