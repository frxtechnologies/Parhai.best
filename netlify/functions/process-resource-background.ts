import serverless from "serverless-http";
import app from "../../backend/src/app";

const apiHandler = serverless(app);

// Netlify recognizes the -background suffix and allows long-running PDF work
// to continue after immediately acknowledging the browser request.
export const handler = async (event: any, context: any) => {
  let resourceId: number;
  try {
    resourceId = Number(JSON.parse(event.body ?? "{}").resourceId);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid processing request." }) };
  }
  if (!Number.isInteger(resourceId) || resourceId <= 0) return { statusCode: 400, body: JSON.stringify({ error: "Invalid resource id." }) };
  return apiHandler({ ...event, path: `/api/resources/${resourceId}/process`, rawPath: `/api/resources/${resourceId}/process`, httpMethod: "POST" }, context);
};
