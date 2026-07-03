import"dotenv/config";import{supabaseAdmin}from"../lib/supabase";import{discoverAiCoverage}from"../services/ai-health-evaluation";
const result=await discoverAiCoverage(supabaseAdmin);console.log(JSON.stringify(result,null,2));
