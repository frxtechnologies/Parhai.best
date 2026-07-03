import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import {startResourceQueueWorker} from "./services/resource-queue-worker";

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Parhai API server listening");
  startResourceQueueWorker();
});
