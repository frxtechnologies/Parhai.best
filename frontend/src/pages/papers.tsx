import { AppLayout } from "@/components/layout/app-layout";
import { getListPapersQueryKey, useListPapers, useListSubjects } from "@/api/client";
import { ExternalLink, FileText, Filter } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { Paper } from "@/api/types";

type PaperType = "ALL" | Paper["type"];

export default function Papers() {
  const [subjectId, setSubjectId] = useState("ALL");
  const [paperType, setPaperType] = useState<PaperType>("ALL");
  const selectedSubjectId = subjectId === "ALL" ? undefined : Number(subjectId);
  const selectedType = paperType === "ALL" ? undefined : paperType;
  const { data: subjects } = useListSubjects();
  const { data: papers, isLoading } = useListPapers(
    { subjectId: selectedSubjectId, type: selectedType },
    { query: { queryKey: getListPapersQueryKey({ subjectId: selectedSubjectId, type: selectedType }) } }
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#0B1F3A] mb-2">Past Papers</h1>
            <p className="text-gray-500">Filter by subject and resource type to find exactly what you need.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 rounded-2xl border bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
              <Filter className="h-4 w-4 text-[#0B1F3A]" />
              Filter
            </div>
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-[#0B1F3A]"
            >
              <option value="ALL">All subjects</option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <select
              value={paperType}
              onChange={(event) => setPaperType(event.target.value as PaperType)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-[#0B1F3A]"
            >
              <option value="ALL">All resources</option>
              <option value="PAST_PAPER">Question papers</option>
              <option value="MARKING_SCHEME">Mark schemes</option>
              <option value="EXAMINER_REPORT">Examiner reports</option>
            </select>
          </div>
        </header>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading papers...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {papers?.map((paper) => (
              <div key={paper.id} className="rounded-2xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="rounded-xl bg-[#0B1F3A]/10 p-3 text-[#0B1F3A]">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      paper.type === "MARKING_SCHEME" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {paper.type === "MARKING_SCHEME" ? "Mark Scheme" : "Question Paper"}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[#0B1F3A]">{paper.subjectName}</div>
                <h2 className="mt-1 line-clamp-2 text-lg font-bold text-[#0B1F3A]">{paper.title}</h2>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-500">
                  <span className="rounded-full bg-gray-50 px-3 py-1">{paper.year}</span>
                  <span className="rounded-full bg-gray-50 px-3 py-1">{paper.session.replace("_", " ")}</span>
                  <span className="rounded-full bg-gray-50 px-3 py-1">Paper {paper.paperNumber}</span>
                  {paper.variant && <span className="rounded-full bg-gray-50 px-3 py-1">Variant {paper.variant}</span>}
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <Link href={`/papers/${paper.id}/view`} className="flex-1 rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#08162B]">View Paper</Link>
                  {paper.markingSchemeUrl && <Link href={`/papers/${paper.id}/view?type=marking-scheme`} className="rounded-xl border p-2.5 transition-colors hover:bg-gray-50" title="View marking scheme"><ExternalLink className="h-4 w-4 text-gray-500" /></Link>}
                </div>
              </div>
            ))}
            {papers?.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border bg-white p-12 text-center text-gray-400">
                No papers match these filters.
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
