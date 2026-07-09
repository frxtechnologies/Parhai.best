import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiLimiter } from "./middleware/rate-limit";

const app: Express = express();

// Behind Netlify's proxy the real client IP arrives in X-Forwarded-For; trust a
// single proxy hop so rate limiting keys on the client rather than the proxy.
app.set("trust proxy", 1);
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173,https://parhais.netlify.app")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) callback(null, true);
    else callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiLimiter, router);

export default app;
