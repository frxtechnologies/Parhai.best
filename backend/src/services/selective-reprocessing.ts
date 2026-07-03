import type {SupabaseClient} from "@supabase/supabase-js";
import {AI_EMBEDDING_MODEL,generateDocumentEmbeddings} from "../lib/ai-service";
import {extractFileText,extractMarkingSchemeAnswers,linkAnswerRows,splitResourceChunks,type ProcessableResource} from "./resource-processor";
import {tagQuestionsForSubject} from "./topic-tagging";
import {classifyQuestionTypeDetailed} from "./source-grounded-query";

async function resource(client:SupabaseClient,id:number){
  const{data,error}=await client.from("resources").select("id,subject_id,level,board,title,resource_type,year,session,paper_code,variant,bucket,storage_path,file_type,original_filename,related_resource_id,extracted_text,subjects(name,code,board)").eq("id",id).single();
  if(error||!data)throw error??new Error("Resource not found.");return data as unknown as ProcessableResource&{extracted_text?:string|null};
}
export async function reprocessEmbeddings(client:SupabaseClient,id:number){
  const r=await resource(client,id),{data:file,error}=await client.storage.from(r.bucket).download(r.storage_path);if(error||!file)throw error??new Error("Download failed.");
  const text=await extractFileText(r,Buffer.from(await file.arrayBuffer())),chunks=splitResourceChunks(text),embeddings=await generateDocumentEmbeddings(chunks);
  await client.from("ai_chunks").delete().eq("resource_id",id);
  const{error:save}=await client.from("ai_chunks").insert(chunks.map((content,index)=>({subject_id:r.subject_id,resource_id:id,chunk_index:index,content,embedding:`[${embeddings[index]!.join(",")}]`,embedding_model:AI_EMBEDDING_MODEL,metadata:{title:r.title,type:r.resource_type,subjectCode:r.subjects?.code}})));if(save)throw save;
  return{chunks:chunks.length,embeddings:embeddings.length};
}
export async function reprocessTopicTags(client:SupabaseClient,id:number){
  const r=await resource(client,id),{data:questions,error}=await client.from("question_index").select("id,question_number,clean_question_text,marks").eq("resource_id",id);if(error)throw error;
  const input=(questions??[]).map(q=>({number:q.question_number,text:q.clean_question_text,marks:q.marks})),tags=await tagQuestionsForSubject(client,r.subjects?.code??"",r.subjects?.name??"Subject",input);let updated=0;
  for(const q of questions??[]){const tag=tags.get(q.question_number);if(!tag)continue;const{error:update}=await client.from("question_index").update({topic:tag.topic,subtopic:tag.subtopic,difficulty:tag.difficulty,confidence:tag.confidence,needs_review:tag.needsReview,student_verified:!tag.needsReview&&tag.confidence>=.60,review_status:!tag.needsReview&&tag.confidence>=.60?"verified":"needs_review",tagging_method:tag.method,tagging_note:tag.note}).eq("id",q.id);if(update)throw update;updated++}
  return{updated};
}
export async function reprocessMarkingSchemeLinks(client:SupabaseClient,id:number){
  const r=await resource(client,id);let paperId=r.resource_type==="MARKING_SCHEME"?r.related_resource_id:id,schemes:any[]=[];
  if(r.resource_type==="MARKING_SCHEME")schemes=[r];else{const{data,error}=await client.from("resources").select("id,extracted_text").eq("resource_type","MARKING_SCHEME").eq("related_resource_id",id);if(error)throw error;schemes=data??[]}
  if(!paperId)return{linked:0,needsReview:true};let linked=0;
  for(const scheme of schemes){const text=scheme.extracted_text??r.extracted_text;if(!text)continue;linked+=await linkAnswerRows(client,Number(paperId),Number(scheme.id),extractMarkingSchemeAnswers(text))}
  return{linked,needsReview:linked===0};
}
export async function reprocessQuestionTypes(client:SupabaseClient,id:number){
  const{data:questions,error}=await client.from("question_index").select("id,clean_question_text,display_question_text,question_text").eq("resource_id",id);
  if(error)throw error;let updated=0,needsReview=0;
  for(const question of questions??[]){
    const classified=classifyQuestionTypeDetailed(String(question.clean_question_text??question.display_question_text??question.question_text??""));
    const{error:update}=await client.from("question_index").update({
      question_type:classified.questionType,question_type_confidence:classified.confidence,
      question_type_needs_review:classified.needsReview,question_type_reason:classified.reason,
      question_type_metadata:{subtypes:classified.subtypes},
    }).eq("id",question.id);
    if(update)throw update;updated+=1;if(classified.needsReview)needsReview+=1;
  }
  return{updated,needsReview};
}
