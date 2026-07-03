import"dotenv/config";import{supabaseAdmin}from"../lib/supabase";import{runDynamicAiEvaluation}from"../services/ai-health-evaluation";
const result=await runDynamicAiEvaluation(supabaseAdmin);console.log(JSON.stringify(result,null,2));if(result.failed.length)process.exitCode=1;
