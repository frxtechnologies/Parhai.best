import pino from "pino";

// Pretty transports are useful in a local terminal, but serverless bundles cannot
// resolve pino-pretty reliably. Enable it only when development is explicit.
const usePrettyTransport =
  process.env.NODE_ENV === "development" &&
  process.env.NETLIFY !== "true" &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(usePrettyTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
