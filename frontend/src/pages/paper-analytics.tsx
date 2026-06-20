import { AppLayout } from "@/components/layout/app-layout";
import { requireSupabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

type Row = { id:number; topic:string; year:number|null; subjects:{name:string}|null };
export default function PaperAnalytics(){
  const [rows,setRows]=useState<Row[]>([]); const [error,setError]=useState("");
  useEffect(()=>{requireSupabase().from("questions").select("id,topic,year,subjects(name)").then(({data,error})=>{if(error)setError(error.message);else setRows((data??[]) as unknown as Row[]);});},[]);
  const topics=useMemo(()=>Object.entries(rows.reduce<Record<string,number>>((a,r)=>{a[r.topic]=(a[r.topic]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]),[rows]);
  const years=useMemo(()=>Object.entries(rows.reduce<Record<string,number>>((a,r)=>{const y=String(r.year??"Unknown");a[y]=(a[y]??0)+1;return a;},{})).sort(),[rows]);
  return <AppLayout><div className="space-y-7"><div><h1 className="text-3xl font-bold text-[#0B1F3A]">Paper analytics</h1><p className="text-gray-500">Computed only from extracted questions in Supabase.</p></div>{error&&<p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}<div className="grid gap-5 lg:grid-cols-2"><Panel title="Most repeated topics" rows={topics}/><Panel title="Questions by year" rows={years}/></div><div className="rounded-2xl border bg-white p-6"><h2 className="font-bold text-[#0B1F3A]">Exam pattern insight</h2><p className="mt-2 text-sm text-gray-500">{topics.length?`${topics[0][0]} is currently the most frequent topic with ${topics[0][1]} extracted questions.`:"Upload and process real papers to generate insights."}</p></div></div></AppLayout>;
}
function Panel({title,rows}:{title:string;rows:Array<[string,number]>}){const max=Math.max(1,...rows.map(r=>r[1]));return <div className="rounded-2xl border bg-white p-6"><h2 className="mb-5 text-xl font-bold text-[#0B1F3A]">{title}</h2><div className="space-y-3">{rows.slice(0,12).map(([label,value])=><div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><b>{value}</b></div><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-[#14B8A6]" style={{width:`${value/max*100}%`}}/></div></div>)}{!rows.length&&<p className="text-sm text-gray-500">No processed questions yet.</p>}</div></div>}
