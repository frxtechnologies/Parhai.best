import "dotenv/config";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the legacy import script.");
const [{ supabaseAdmin }, { importLegacyPapers }] = await Promise.all([
  import("../lib/supabase"),
  import("../services/legacy-import"),
]);
const result = await importLegacyPapers(supabaseAdmin);
console.log(JSON.stringify(result));
