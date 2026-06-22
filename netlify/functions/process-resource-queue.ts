import { createClient } from "@supabase/supabase-js";
import { processResourceById } from "../../backend/src/services/resource-job";

export const handler = async () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { statusCode: 503, body: JSON.stringify({ error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for automatic processing." }) };
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: resources, error } = await client.from("resources").select("id")
    .eq("processing_status", "pending").order("created_at").limit(2);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  const completed: number[] = [];
  const failed: Array<{ resourceId: number; error: string }> = [];
  for (const resource of resources ?? []) {
    try {
      await processResourceById(client, Number(resource.id));
      completed.push(Number(resource.id));
    } catch (cause) {
      failed.push({ resourceId: Number(resource.id), error: cause instanceof Error ? cause.message : "Processing failed." });
    }
  }
  return { statusCode: 200, body: JSON.stringify({ attempted: resources?.length ?? 0, completed, failed }) };
};
