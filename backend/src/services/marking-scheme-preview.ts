import type { SupabaseClient } from "@supabase/supabase-js";
import {isOfficialQuestionAnswer} from "./marking-scheme-intelligence";

type PdfTextItem={text:string;x:number;y:number};

export function normalizeMarkingSchemeLabel(value:string){
  return value.toLowerCase().replace(/\s+/g,"").replace(/[.\-:]/g,"");
}

export function findMarkingSchemeRow(
  items:PdfTextItem[],
  questionNumber:string,
  questionPart:string|null|undefined,
){
  const target=normalizeMarkingSchemeLabel(`${questionNumber}${questionPart??""}`);
  const base=normalizeMarkingSchemeLabel(questionNumber);
  const lines:{y:number;items:PdfTextItem[]}[]=[];
  for(const item of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){
    const line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=4);
    if(line)line.items.push(item);
    else lines.push({y:item.y,items:[item]});
  }
  const normalized=lines.map(line=>({
    y:line.y,
    text:normalizeMarkingSchemeLabel(line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join("")),
  }));
  const labelPattern=/^\d{1,2}(?:\([a-z]\)(?:\([ivx]+\))?)?/;
  const index=normalized.findIndex(line=>{
    const label=line.text.match(labelPattern)?.[0]??"";
    return questionPart?label===target||label.startsWith(target):label===base;
  });
  if(index<0)return null;
  const next=normalized.slice(index+1).find(line=>labelPattern.test(line.text));
  return{y:Math.max(0,normalized[index]!.y-18),nextY:next?.y??null};
}

export async function renderMarkingSchemePreview(client:SupabaseClient,questionId:number) {
  const {data:question,error}=await client.from("question_index")
    .select("id,subject_id,resource_id,year,session,paper_code,variant,question_number,question_part,marking_scheme_answer_id,marking_scheme_link_status,resources(level,year,session,paper_number,paper_code,variant),subjects(code,level)")
    .eq("id",questionId).single();
  if(error||!question) throw new Error(error?.message??"Question not found.");
  if(!question.marking_scheme_answer_id) throw new Error("marking_scheme_missing");
  const {data:answer,error:answerError}=await client.from("marking_scheme_answers")
    .select("id,resource_id,syllabus_code,level,year,session,paper_number,variant,question_number,question_part,clean_answer_text,source_page,answer_type,is_question_specific,confidence,extraction_confidence,link_confidence,resources(level,year,session,paper_number,paper_code,variant,subjects(code,level))")
    .eq("id",question.marking_scheme_answer_id).single();
  if(answerError)throw new Error(answerError.message);
  if(!answer||!isOfficialQuestionAnswer(answer,question.marking_scheme_link_status,question)) throw new Error("question_specific_marking_scheme_missing");
  const {data:resource,error:resourceError}=await client.from("resources").select("id,bucket,storage_path").eq("id",answer.resource_id).single();
  if(resourceError||!resource) throw new Error("marking_scheme_pdf_missing");
  const {data:file,error:downloadError}=await client.storage.from(resource.bucket).download(resource.storage_path);
  if(downloadError||!file) throw new Error("marking_scheme_pdf_missing");
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const {createCanvas}=await import("@napi-rs/canvas");
  const document=await getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const base=String(answer.question_number);
  let match:{page:number;y:number;nextY:number|null}|null=answer.source_page?{page:Number(answer.source_page),y:0,nextY:null}:null;
  for(let pageNumber=1;!match&&pageNumber<=document.numPages;pageNumber+=1){
    const page=await document.getPage(pageNumber),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
    const items=content.items.filter((item:any)=>"str"in item&&String(item.str).trim()).map((item:any)=>({
      text:String(item.str).trim(),
      x:Number(item.transform[4]),
      y:viewport.height-Number(item.transform[5]),
    }));
    const row=findMarkingSchemeRow(items,String(answer.question_number),answer.question_part);
    if(row){match={page:pageNumber,...row};break;}
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
