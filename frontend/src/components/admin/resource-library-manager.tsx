import { groupExamResources, normalizeExamResource, pairStatus, type ExamLibraryResource, type ExamPair } from "@/lib/exam-resource-library";
import { Eye, FileQuestion, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type Resource = ExamLibraryResource & { bucket?: string; storage_path?: string; ai_chunks?: Array<{ count: number }> };
type Filters = { subject: string; year: string; session: string; paper: string; variant: string; status: string; type: string; search: string };
const emptyFilters: Filters = { subject: "", year: "", session: "", paper: "", variant: "", status: "", type: "", search: "" };

export function ResourceLibraryManager({ resources, onOpen, onReprocess, onDelete, busy }: {
  resources: Resource[]; onOpen: (resource: Resource) => void | Promise<void>; onReprocess: (id: number) => void; onDelete: (id: number) => void; busy: boolean;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [compact, setCompact] = useState(false);
  const filtered = useMemo(() => resources.filter((resource) => {
    const meta = normalizeExamResource(resource);
    const search = filters.search.toLowerCase();
    return (!filters.subject || resource.subject_id === Number(filters.subject))
      && (!filters.year || resource.year === Number(filters.year))
      && (!filters.session || resource.session === filters.session)
      && (!filters.paper || meta.paperNumber === Number(filters.paper))
      && (!filters.variant || resource.variant === Number(filters.variant))
      && (!filters.status || meta.statusLabel === filters.status)
      && (!filters.type || resource.resource_type === filters.type)
      && (!search || `${resource.original_filename} ${resource.subjects?.name} ${meta.displayTitle}`.toLowerCase().includes(search));
  }), [resources, filters]);
  const groups = useMemo(() => groupExamResources(filtered), [filtered]);
  const pairs = groups.flatMap((subject) => subject.yearGroups.flatMap((year) => year.sessions.flatMap((session) => session.papers)));
  const summary = {
    total: filtered.length,
    questionPapers: filtered.filter((r) => r.resource_type === "PAST_PAPER").length,
    markingSchemes: filtered.filter((r) => r.resource_type === "MARKING_SCHEME").length,
    processed: filtered.filter((r) => normalizeExamResource(r).statusLabel === "Processed").length,
    processing: filtered.filter((r) => normalizeExamResource(r).statusLabel === "Processing").length,
    failed: filtered.filter((r) => normalizeExamResource(r).statusLabel === "Failed").length,
    missingPairs: pairs.filter((pair) => !pair.questionPaper || !pair.markingScheme).length,
  };
  const years = [...new Set(resources.map((r) => r.year).filter(Boolean) as number[])].sort((a, b) => b - a);
  const subjects = [...new Map(resources.map((r) => [r.subject_id, r.subjects])).entries()].sort((a, b) => (a[1]?.name ?? "").localeCompare(b[1]?.name ?? ""));

  return <section className="space-y-5">
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div><h2 className="text-xl font-bold text-[#0B1F3A]">Exam resource library</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} matching resources, organised into exam sets.</p></div>
        <div className="inline-flex w-fit rounded-lg border bg-slate-50 p-1 text-xs font-semibold">
          <button onClick={() => setCompact(false)} className={`rounded-md px-3 py-2 ${!compact ? "bg-white text-[#0B1F3A] shadow-sm" : "text-slate-500"}`}>Comfortable</button>
          <button onClick={() => setCompact(true)} className={`rounded-md px-3 py-2 ${compact ? "bg-white text-[#0B1F3A] shadow-sm" : "text-slate-500"}`}>Compact table</button>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <FilterSelect value={filters.subject} onChange={(subject) => setFilters({ ...filters, subject })} label="All subjects" options={subjects.map(([id, value]) => [String(id), value?.name ?? "Unknown"])} />
        <FilterSelect value={filters.year} onChange={(year) => setFilters({ ...filters, year })} label="All years" options={years.map((year) => [String(year), String(year)])} />
        <FilterSelect value={filters.session} onChange={(session) => setFilters({ ...filters, session })} label="All sessions" options={[["OCT_NOV","Oct/Nov"],["MAY_JUNE","May/June"],["FEB_MAR","Feb/March"]]} />
        <FilterSelect value={filters.paper} onChange={(paper) => setFilters({ ...filters, paper })} label="All papers" options={[1,2,3,4,5,6].map((n) => [String(n), `Paper ${n}`])} />
        <FilterSelect value={filters.variant} onChange={(variant) => setFilters({ ...filters, variant })} label="All variants" options={[1,2,3].map((n) => [String(n), `Variant ${n}`])} />
        <FilterSelect value={filters.status} onChange={(status) => setFilters({ ...filters, status })} label="All statuses" options={["Processed","Processing","Failed","Needs Review"].map((v) => [v,v])} />
        <FilterSelect value={filters.type} onChange={(type) => setFilters({ ...filters, type })} label="All types" options={[...new Set(resources.map((r) => r.resource_type))].sort().map((v) => [v, titleCase(v)])} />
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search" className="field-input py-2.5 pl-9" /></label>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {Object.entries(summary).map(([key, value]) => <div key={key} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-2xl font-bold text-[#0B1F3A]">{value}</p><p className="mt-1 text-xs capitalize text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p></div>)}
    </div>

    {groups.map((subject) => <section key={subject.subjectId} className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B1F3A] text-sm font-bold text-white">{subject.subjectName.charAt(0)}</span><div><h3 className="font-bold text-[#0B1F3A]">{subject.subjectName}</h3><p className="text-xs text-slate-400">{subject.subjectCode}</p></div></div>
      <div className="space-y-3">{subject.yearGroups.map((yearGroup, yearIndex) => <details key={yearGroup.year} open={yearIndex === 0} className="group/year overflow-hidden rounded-xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between bg-slate-50 px-4 py-3 font-bold text-[#0B1F3A]"><span>{yearGroup.year || "General"}</span><span className="text-xs font-medium text-slate-400">{yearGroup.sessions.reduce((sum, session) => sum + session.papers.length + session.otherResources.length + (session.gradeThreshold ? 1 : 0), 0)} resources</span></summary>
        <div className="space-y-3 p-3">{yearGroup.sessions.map((session) => <details key={session.session} open={yearIndex === 0} className="overflow-hidden rounded-lg border">
          <summary className="cursor-pointer list-none border-b bg-white px-4 py-3 font-semibold text-[#0B1F3A]">{session.sessionLabel}</summary>
          <div className={compact ? "p-2" : "p-3"}>
            {session.gradeThreshold && <div className="mb-3 flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2"><div><p className="text-sm font-semibold text-[#0B1F3A]">Grade Threshold</p><p className="text-xs text-slate-400">{session.gradeThreshold.original_filename}</p></div><LibraryButton onClick={() => onOpen(session.gradeThreshold! as Resource)}>View</LibraryButton></div>}
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs text-slate-400"><tr><th className="px-3 py-2">Exam paper</th><th className="px-3 py-2">Question paper</th><th className="px-3 py-2">Marking scheme</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody className="divide-y">{session.papers.map((pair) => <DesktopPairRow key={`${pair.paperNumber}-${pair.variant}`} pair={pair} compact={compact} onOpen={onOpen} onReprocess={onReprocess} onDelete={onDelete} busy={busy} />)}{session.otherResources.map((resource) => <DesktopResourceRow key={resource.id} resource={resource as Resource} compact={compact} onOpen={onOpen} onReprocess={onReprocess} onDelete={onDelete} busy={busy} />)}</tbody></table></div>
            <div className="space-y-3 md:hidden">{session.papers.map((pair) => <MobilePairCard key={`${pair.paperNumber}-${pair.variant}`} pair={pair} onOpen={onOpen} onReprocess={onReprocess} onDelete={onDelete} />)}{session.otherResources.map((resource) => <MobileResourceCard key={resource.id} resource={resource as Resource} onOpen={onOpen} onReprocess={onReprocess} onDelete={onDelete} />)}</div>
          </div>
        </details>)}</div>
      </details>)}</div>
    </section>)}
    {!groups.length && <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-sm text-slate-400">No resources match these filters.</div>}
  </section>;
}

function DesktopPairRow({ pair, compact, onOpen, onReprocess, onDelete, busy }: { pair: ExamPair; compact: boolean; onOpen: (r: Resource) => void; onReprocess: (id: number) => void; onDelete: (id: number) => void; busy: boolean }) {
  const primary = (pair.questionPaper ?? pair.markingScheme)! as Resource;
  return <tr><td className={compact ? "px-3 py-2" : "px-3 py-4"}><p className="font-semibold text-[#0B1F3A]">Paper {pair.paperNumber ?? "—"} · Variant {pair.variant ?? "—"}</p><p className="mt-0.5 text-xs text-slate-400">{primary.original_filename}</p></td><td className="px-3 py-2">{pair.questionPaper ? <LibraryButton onClick={() => onOpen(pair.questionPaper as Resource)}>Question Paper</LibraryButton> : <span className="text-xs text-slate-400">Not uploaded</span>}</td><td className="px-3 py-2">{pair.markingScheme ? <LibraryButton onClick={() => onOpen(pair.markingScheme as Resource)}>Marking Scheme</LibraryButton> : <span className="text-xs text-slate-400">Not uploaded</span>}</td><td className="px-3 py-2"><StatusBadge status={pairStatus(pair)} /></td><td className="px-3 py-2"><div className="flex justify-end gap-1"><Link href={`/admin/processing#resource-${primary.id}`} className="rounded-lg border p-2 text-slate-500" title="View indexed questions"><FileQuestion className="h-4 w-4" /></Link><button disabled={busy} onClick={() => onReprocess(primary.id)} className="rounded-lg border p-2 text-slate-500" title="Reprocess"><RefreshCw className="h-4 w-4" /></button>{pair.questionPaper && <button disabled={busy} onClick={() => onDelete(pair.questionPaper!.id)} className="rounded-lg border p-2 text-red-500" title="Delete question paper"><Trash2 className="h-4 w-4" /></button>}{pair.markingScheme && <button disabled={busy} onClick={() => onDelete(pair.markingScheme!.id)} className="rounded-lg border p-2 text-red-500" title="Delete marking scheme"><Trash2 className="h-4 w-4" /></button>}</div></td></tr>;
}
function DesktopResourceRow({ resource, compact, onOpen, onReprocess, onDelete, busy }: { resource: Resource; compact: boolean; onOpen: (r: Resource) => void; onReprocess: (id: number) => void; onDelete: (id: number) => void; busy: boolean }) { const meta=normalizeExamResource(resource); return <tr><td className={compact?"px-3 py-2":"px-3 py-4"}><p className="font-semibold text-[#0B1F3A]">{meta.displayTitle}</p><p className="text-xs text-slate-400">{resource.original_filename}</p></td><td className="px-3 py-2" colSpan={2}><LibraryButton onClick={()=>onOpen(resource)}>View {titleCase(resource.resource_type)}</LibraryButton></td><td className="px-3 py-2"><StatusBadge status={meta.statusLabel}/></td><td className="px-3 py-2"><div className="flex justify-end gap-1"><Link href={`/admin/processing#resource-${resource.id}`} className="rounded-lg border p-2 text-slate-500"><FileQuestion className="h-4 w-4"/></Link><button onClick={()=>onReprocess(resource.id)} className="rounded-lg border p-2 text-slate-500"><RefreshCw className="h-4 w-4"/></button><button disabled={busy} onClick={()=>onDelete(resource.id)} className="rounded-lg border p-2 text-red-500"><Trash2 className="h-4 w-4"/></button></div></td></tr>; }
function MobilePairCard({pair,onOpen,onReprocess,onDelete}:{pair:ExamPair;onOpen:(r:Resource)=>void;onReprocess:(id:number)=>void;onDelete:(id:number)=>void}){const primary=(pair.questionPaper??pair.markingScheme)! as Resource;return <div className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#0B1F3A]">Paper {pair.paperNumber??"—"} · Variant {pair.variant??"—"}</p><p className="mt-1 text-xs text-slate-400">{primary.original_filename}</p></div><StatusBadge status={pairStatus(pair)}/></div><div className="mt-3 flex flex-wrap gap-2">{pair.questionPaper&&<LibraryButton onClick={()=>onOpen(pair.questionPaper as Resource)}>Question Paper</LibraryButton>}{pair.markingScheme&&<LibraryButton onClick={()=>onOpen(pair.markingScheme as Resource)}>Marking Scheme</LibraryButton>}<button onClick={()=>onReprocess(primary.id)} className="rounded-lg border px-3 py-2 text-xs">Reprocess</button><button onClick={()=>onDelete(primary.id)} className="rounded-lg border px-3 py-2 text-xs text-red-600">Delete</button></div></div>}
function MobileResourceCard({resource,onOpen,onReprocess,onDelete}:{resource:Resource;onOpen:(r:Resource)=>void;onReprocess:(id:number)=>void;onDelete:(id:number)=>void}){const meta=normalizeExamResource(resource);return <div className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-[#0B1F3A]">{meta.displayTitle}</p><p className="text-xs text-slate-400">{resource.original_filename}</p></div><StatusBadge status={meta.statusLabel}/></div><div className="mt-3 flex gap-2"><LibraryButton onClick={()=>onOpen(resource)}>View</LibraryButton><button onClick={()=>onReprocess(resource.id)} className="rounded-lg border px-3 py-2 text-xs">Reprocess</button><button onClick={()=>onDelete(resource.id)} className="rounded-lg border px-3 py-2 text-xs text-red-600">Delete</button></div></div>}
function StatusBadge({status}:{status:string}){const tone=status==="Processed"?"bg-emerald-50 text-emerald-700":status==="Processing"?"bg-blue-50 text-blue-700":status==="Failed"?"bg-red-50 text-red-700":status==="Needs Review"?"bg-amber-50 text-amber-700":"bg-slate-100 text-amber-700";return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{status}</span>}
function LibraryButton({children,onClick}:{children:React.ReactNode;onClick:()=>void}){return <button onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-[#0B1F3A] hover:border-teal-300"><Eye className="h-3.5 w-3.5"/>{children}</button>}
function FilterSelect({value,onChange,label,options}:{value:string;onChange:(v:string)=>void;label:string;options:string[][]}){return <select className="field-input py-2.5" value={value} onChange={(e)=>onChange(e.target.value)}><option value="">{label}</option>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}
function titleCase(value:string){return value.toLowerCase().replace(/_/g," ").replace(/\b\w/g,(c)=>c.toUpperCase())}
