import"dotenv/config";import{supabaseAdmin}from"../lib/supabase";import{evaluateAllMarkingLinks}from"../services/ai-health-evaluation";
const apply=process.argv.includes("--apply"),result=await evaluateAllMarkingLinks(supabaseAdmin);
const plan=result.checked.map(row=>({questionId:row.questionId,status:row.valid?"linked":row.mismatchFields?.length?"invalid_link":"needs_review",linkStatus:row.valid?"linked_exact":"needs_review"}));
if(apply)for(let index=0;index<plan.length;index+=20)await Promise.all(plan.slice(index,index+20).map(async item=>{
  const{error}=await supabaseAdmin.from("question_index").update({marking_scheme_status:item.status,marking_scheme_link_status:item.linkStatus,updated_at:new Date().toISOString()}).eq("id",item.questionId);
  if(error)throw error;
}));
console.log(JSON.stringify({mode:apply?"applied":"dry_run",checked:plan.length,linked:plan.filter(row=>row.status==="linked").length,invalidLink:plan.filter(row=>row.status==="invalid_link").length,needsReview:plan.filter(row=>row.status==="needs_review").length}));
