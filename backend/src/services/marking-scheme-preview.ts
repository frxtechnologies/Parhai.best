import type { SupabaseClient } from "@supabase/supabase-js";

export async function renderMarkingSchemePreview(client:SupabaseClient,questionId:number) {
  const {data:question,error}=await client.from("question_index")
    .select("id,question_number,marking_scheme_answer_id,marking_scheme_link_status,marking_scheme_answers(id,resource_id,question_number,question_part,clean_answer_text,source_page)")
    .eq("id",questionId).single();
  if(error||!question) throw new Error(error?.message??"Question not found.");
  if(!["linked","partial","linked_exact","linked_partial"].includes(question.marking_scheme_link_status)||!question.marking_scheme_answer_id) throw new Error("marking_scheme_missing");
  const answer=Array.isArray(question.marking_scheme_answers)?question.marking_scheme_answers[0]:question.marking_scheme_answers;
  if(!answer) throw new Error("marking_scheme_missing");
  const {data:resource,error:resourceError}=await client.from("resources").select("id,bucket,storage_path").eq("id",answer.resource_id).single();
  if(resourceError||!resource) throw new Error("marking_scheme_pdf_missing");
  const {data:file,error:downloadError}=await client.storage.from(resource.bucket).download(resource.storage_path);
  if(downloadError||!file) throw new Error("marking_scheme_pdf_missing");
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const {createCanvas}=await import("@napi-rs/canvas");
  const document=await getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const key=`${answer.question_number}${answer.question_part??""}`.replace(/\s+/g,"");
  const base=String(answer.question_number);
  let match:{page:number;y:number;nextY:number|null}|null=answer.source_page?{page:Number(answer.source_page),y:0,nextY:null}:null;
  for(let pageNumber=1;!match&&pageNumber<=document.numPages;pageNumber+=1){
    const page=await document.getPage(pageNumber),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
    const items=content.items.filter((item:any)=>"str"in item&&String(item.str).trim()).map((item:any)=>({text:String(item.str).replace(/\s+/g,"").trim(),y:viewport.height-Number(item.transform[5])})).sort((a:any,b:any)=>a.y-b.y);
    const index=items.findIndex((item:any)=>item.text===key||item.text.startsWith(key)||(!answer.question_part&&item.text===base));
    if(index>=0){
      const next=items.slice(index+1).find((item:any)=>/^\d{1,2}(?:\([a-z]\)(?:\([ivx]+\))?)?$/.test(item.text));
      match={page:pageNumber,y:Math.max(0,items[index]!.y-18),nextY:next?.y??null};break;
    }
  }
  if(!match){
    // Deterministic safe fallback: find the first page containing the base
    // question number and return the full page. Never guess an unrelated page.
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
      const page=await document.getPage(pageNumber),content=await page.getTextContent();
      const text=content.items.filter((item:any)=>"str"in item).map((item:any)=>String(item.str)).join(" ");
      if(new RegExp(`(?:^|\\s)${base}(?:\\s|$)`).test(text)){match={page:pageNumber,y:0,nextY:null};break;}
    }
  }
  if(!match){await document.destroy();throw new Error("marking_scheme_page_match_failed");}
  const page=await document.getPage(match.page),scale=1.8,viewport=page.getViewport({scale});
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  await page.render({canvasContext:canvas.getContext("2d") as never,viewport,canvas:canvas as never}).promise;
  const useFullPage=match.y===0&&!match.nextY;
  const y=useFullPage?0:Math.floor(match.y*scale),height=useFullPage?canvas.height:Math.min(canvas.height-y,Math.max(180,Math.ceil(((match.nextY??Math.min(match.y+260,viewport.height/scale))-match.y)*scale)));
  const output=createCanvas(canvas.width,height);output.getContext("2d").drawImage(canvas,0,y,canvas.width,height,0,0,canvas.width,height);
  const buffer=output.toBuffer("image/png");await document.destroy();
  return{buffer,pageNumber:match.page,status:useFullPage?"full_page_fallback":question.marking_scheme_link_status,resourceId:resource.id,answerText:answer.clean_answer_text};
}
