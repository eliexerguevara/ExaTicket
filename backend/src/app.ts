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
      if (allowedOrigins.some(o => origin === o || origin.startsWith(o))) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    }
  })
);
app.use(cookieParser());
app.use(express.json());
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
