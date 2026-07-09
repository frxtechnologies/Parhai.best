import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { getAiStatus } from "./lib/ai-service";

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  const ai = getAiStatus();
  logger.info({ port, aiProvider: ai.provider, aiModel: ai.model, embeddingModel: ai.embeddingModel }, "Parhai API server listening");
});
