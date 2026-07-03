import"dotenv/config";import{supabaseAdmin}from"../lib/supabase";import{evaluateAllMarkingLinks}from"../services/ai-health-evaluation";
const result=await evaluateAllMarkingLinks(supabaseAdmin);
const reasonCounts=result.invalid.flatMap(row=>row.reasons??[]).reduce((counts:Record<string,number>,reason:string)=>(counts[reason]=(counts[reason]??0)+1,counts),{});
const{checked:_,...summary}=result;
console.log(JSON.stringify({...summary,invalid:result.invalid.slice(0,25),invalidOutputLimited:true,reasonCounts},null,2));if(result.invalidLinks)process.exitCode=1;
