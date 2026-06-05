import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";

import "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import { logger } from "./utils/logger";

// ─── Simple in-memory rate limiter (no external deps) ────────────────────────
const _rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const rateLimit = (
  maxRequests: number,
  windowMs: number
) => (req: Request, res: Response, next: NextFunction): void => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const entry = _rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  entry.count += 1;
  if (entry.count > maxRequests) {
    res.status(429).json({ error: "Too many requests. Try again later." });
    return;
  }
  return next();
};

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

// Allow both HTTP and HTTPS origins from the same host (supports voice notes via HTTPS)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_HTTPS
].filter(Boolean) as string[];

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin)
      if (!origin) return callback(null, true);
      // Exact match only — startsWith would allow evil.com if origin="https://allowed.com.evil.com"
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    }
  })
);
app.use(cookieParser());
app.use(express.json());

// ─── Security headers (inline, no helmet needed) ──────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

// ─── Rate limiting on auth endpoints ──────────────────────────────────────────
// Login: max 10 attempts per 15 min per IP
app.use("/auth/login", rateLimit(10, 15 * 60 * 1000));
// Forgot password: max 5 per hour per IP
app.use("/auth/forgot-password", rateLimit(5, 60 * 60 * 1000));
// Refresh token: max 60 per 15 min per IP (reload storms)
app.use("/auth/refresh_token", rateLimit(60, 15 * 60 * 1000));

app.use(Sentry.Handlers.requestHandler());
app.use("/public", express.static(uploadConfig.directory));
app.use(routes);

app.use(Sentry.Handlers.errorHandler());

app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
