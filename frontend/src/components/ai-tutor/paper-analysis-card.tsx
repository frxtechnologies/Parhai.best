import type { PaperAnalysis } from "@/api/types";

export function PaperAnalysisCard({analysis}:{analysis:PaperAnalysis}) {
  const overview=analysis.overview;
  if(!overview)return null;
  const stats=[
    ["Indexed",overview.totalIndexedQuestions],["Verified",overview.verifiedQuestions],
    ["Marks",overview.totalMarks||"—"],["MS linked",overview.markingSchemeLinked],
    ["MS missing",overview.markingSchemeMissing],["Previews",overview.screenshotsAvailable],
  ];
  return <section className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <div>
      <h4 className="font-semibold text-[#0B1F3A]">Verified paper analytics</h4>
      <p className="text-xs text-slate-500">{overview.subjectCode} · {overview.session.replace("_"," ")} {overview.year} · Paper {overview.paperNumber} Variant {overview.variant} · {overview.completeness}</p>
    </div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{stats.map(([label,value])=><div key={label} className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-200"><p className="font-bold text-[#0B1F3A]">{value}</p><p className="text-[10px] text-slate-500">{label}</p></div>)}</div>
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
      <table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Topic</th><th>Questions</th><th>Marks</th><th>% marks</th><th>Difficulty</th><th>MS linked</th></tr></thead>
      <tbody>{analysis.topics?.map(topic=><tr key={topic.topic} className="border-t"><td className="p-3 font-semibold">{topic.topic}<div className="mt-1 font-normal text-slate-400">{Object.entries(topic.subtopics).map(([name,count])=>`${name} (${count})`).join(" · ")}</div></td><td>{topic.questions}</td><td>{topic.marks}</td><td>{topic.percentageOfMarks}%</td><td>{topic.averageDifficulty}</td><td>{topic.markingSchemeLinked}</td></tr>)}</tbody></table>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">{Object.entries(analysis.difficulty??{}).map(([name,value])=><div key={name} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs font-semibold">{name}</p><p className="mt-1 text-slate-500">{value.questions} questions · {value.marks} marks</p></div>)}</div>
    {!!analysis.revisionRecommendation?.length&&<div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-xs font-semibold text-violet-900">Revision priority</p>{analysis.revisionRecommendation.map(item=><p key={item} className="mt-1 text-xs text-violet-800">{item}</p>)}</div>}
  </section>;
}
