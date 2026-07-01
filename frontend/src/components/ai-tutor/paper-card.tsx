import type { AiSource, TutorAction } from "@/api/types";
import { API_BASE_URL } from "@/api/client";
import { requireSupabase } from "@/lib/supabase";
import { BarChart3, FileText, List } from "lucide-react";

export function PaperCard({source,onAction}:{source:AiSource;onAction?:(action:TutorAction,label:string)=>void}) {
  const session=String(source.session??"").replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  const subjectCode=source.subjectCode??source.reference.match(/\b(4024|5054)\b/)?.[1]??"";
  const subjectName=source.subjectName??(subjectCode==="4024"?"Mathematics":subjectCode==="5054"?"Physics":"Cambridge");
  const paper={subjectCode,year:Number(source.year),session:String(source.session),paperNumber:Number(source.paperNumber),variant:Number(source.variant),resourceId:source.resourceId??undefined};
  async function viewPdf(){
    if(!source.resourceId)return;
    const {data}=await requireSupabase().auth.getSession();
    const response=await fetch(`${API_BASE_URL}/api/resources/${source.resourceId}/view-url`,{headers:{Authorization:`Bearer ${data.session?.access_token??""}`}});
    const body=await response.json() as {url?:string};
    if(response.ok&&body.url)window.open(body.url,"_blank","noopener,noreferrer");
  }
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><FileText className="h-5 w-5"/></div>
      <div className="min-w-0 flex-1">
        <h5 className="font-semibold text-[#0B1F3A]">{subjectName} {subjectCode} · {session} {source.year} · Paper {source.paperNumber} Variant {source.variant}</h5>
        <p className="mt-1 text-xs text-slate-500">Question Paper</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {source.resourceId&&<button onClick={viewPdf} className="rounded-lg border px-3 py-2 text-xs font-semibold">View PDF</button>}
      <button onClick={()=>onAction?.({type:"paper_analysis",...paper},"Analyze this paper")} className="inline-flex items-center gap-1 rounded-lg bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-white"><BarChart3 className="h-3.5 w-3.5"/>Analyze paper</button>
      <button onClick={()=>onAction?.({type:"show_questions_from_paper",...paper},"Show questions from this paper")} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold"><List className="h-3.5 w-3.5"/>Show questions</button>
    </div>
  </article>;
}
