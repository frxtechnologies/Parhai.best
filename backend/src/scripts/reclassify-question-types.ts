import"dotenv/config";
import{supabaseAdmin}from"../lib/supabase";
import{classifyQuestionTypeDetailed}from"../services/source-grounded-query";

let updated=0,needsReview=0;
while(true){
  const{data,error}=await supabaseAdmin.from("question_index").select("id,clean_question_text,display_question_text,question_text").eq("question_type_reason","Normalized from the existing deterministic classifier.").order("id").limit(100);
  if(error)throw error;if(!data?.length)break;
  for(let index=0;index<data.length;index+=20){
    const batch=data.slice(index,index+20);
    const results=await Promise.all(batch.map(async row=>{
      const result=classifyQuestionTypeDetailed(String(row.clean_question_text??row.display_question_text??row.question_text??""));
      const{error:updateError}=await supabaseAdmin.from("question_index").update({
        question_type:result.questionType,question_type_confidence:result.confidence,
        question_type_needs_review:result.needsReview,question_type_reason:result.reason,
        question_type_metadata:{subtypes:result.subtypes},
      }).eq("id",row.id);
      if(updateError)throw updateError;return result;
    }));
    updated+=results.length;needsReview+=results.filter(result=>result.needsReview).length;
  }
  if(data.length<100)break;
}
console.log(JSON.stringify({updated,needsReview}));
