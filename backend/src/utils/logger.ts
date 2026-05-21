import pino from "pino";

type LogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

const level = (process.env.LOG_LEVEL as LogLevel) || "info";

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level,
  prettyPrint: isProduction
    ? false
    : {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:standard"
      }
});

export { logger };
