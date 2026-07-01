import pdf from "pdf-parse/lib/pdf-parse.js";
import { splitNumberedQuestions } from "./resource-processor";

export type ExtractedAnswer = { questionNumber:string; text:string; confidence:number; pageNumber:number|null; needsReview:boolean };
export type AnswerExtractionResult = { provider:string; status:"extracted"|"needs_manual_review"; message:string|null; answers:ExtractedAnswer[]; renderedPages?:number };

export interface AnswerExtractionProvider { name:string; extract(buffer:Buffer):Promise<AnswerExtractionResult> }

class SelectablePdfProvider implements AnswerExtractionProvider {
  name="selectable_pdf";
  async extract(buffer:Buffer) {
    const parsed=await pdf(buffer);
    const text=parsed.text.trim();
    const looksLikeSolvedQuestionPaper=/\bUCLES\b|Cambridge O Level|4024\/\d{2}\/(?:M\/J|O\/N|F\/M)\//i.test(text);
    if(looksLikeSolvedQuestionPaper){
      const renderedPages=await renderPdfPagesForVision(buffer);
      return {provider:this.name,status:"needs_manual_review" as const,message:"Your PDF was uploaded, but handwriting extraction is not configured yet. We created answer boxes from the selected paper so you can type or correct answers manually.",answers:[],renderedPages};
    }
    if(text.length<40) return {provider:this.name,status:"needs_manual_review" as const,message:"Handwriting extraction is not configured yet. You can review and type/correct answers manually.",answers:[]};
    const answers=splitNumberedQuestions(text).map((row)=>({questionNumber:row.number,text:row.text,confidence:0.82,pageNumber:null,needsReview:false}));
    return answers.length
      ? {provider:this.name,status:"extracted" as const,message:null,answers}
      : {provider:this.name,status:"needs_manual_review" as const,message:"Question numbers could not be detected reliably. Review and type/correct answers manually.",answers:[]};
  }
}

export class AnswerExtractionService {
  constructor(private providers:AnswerExtractionProvider[]=[new SelectablePdfProvider()]){}
  async extract(buffer:Buffer){let fallback:AnswerExtractionResult|null=null;for(const provider of this.providers){const result=await provider.extract(buffer);if(result.status==="extracted")return result;fallback=result;}return fallback??{provider:"manual",status:"needs_manual_review" as const,message:"Handwriting extraction is not configured yet. You can review and type/correct answers manually.",answers:[]};}
}

export const answerExtractionService=new AnswerExtractionService();

export async function renderPdfPagesForVision(buffer:Buffer) {
  const canvasModule="@napi-rs/canvas";const {createCanvas}=await import(canvasModule);
  const rendererModule="pdfjs-dist/legacy/build/pdf.mjs";const {getDocument}=await import(rendererModule);
  const document=await getDocument({data:new Uint8Array(buffer)}).promise;
  let rendered=0;
  try{
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
      const page=await document.getPage(pageNumber),viewport=page.getViewport({scale:1.25}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:canvas.getContext("2d") as never,viewport,canvas:canvas as never}).promise;
      canvas.toBuffer("image/png");rendered+=1;
    }
  }finally{await document.destroy();}
  return rendered;
}
