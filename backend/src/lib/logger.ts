import pino from "pino";

const isProduction = process.env.NODE_ENV === "production" || process.env.NETLIFY === "true";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
