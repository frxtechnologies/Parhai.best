import { useListSubjects, getListSubjectsQueryKey } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { SubjectMark } from "@/components/subject-mark";
import { Link } from "wouter";
import { FileText, HelpCircle, PenLine } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const LEVELS = ["ALL", "O_LEVEL", "A_LEVEL"] as const;
type LevelFilter = (typeof LEVELS)[number];

export default function Subjects() {
  const [level, setLevel] = useState<LevelFilter>("ALL");
  const { data: subjects, isLoading } = useListSubjects(
    level === "ALL" ? undefined : { level },
    {
      query: {
        queryKey: getListSubjectsQueryKey(level === "ALL" ? undefined : { level }),
      },
    }
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="flex flex-col gap-5 rounded-[28px] bg-[#0B1F3A] p-6 text-white shadow-[0_24px_60px_rgba(11,31,58,.16)] md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-200">Your Cambridge courses</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose a subject</h1>
            <p className="mt-2 text-sm text-slate-300">Past papers, topical questions, notes, and your AI teacher in one place.</p>
          </div>

          <div className="flex w-full gap-1 rounded-xl border border-white/15 bg-white/10 p-1 md:w-auto">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  level === l
                    ? "bg-white text-[#0B1F3A] shadow-sm"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l === "ALL" ? "All" : l === "O_LEVEL" ? "O Level" : "A Level"}
              </button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center p-12 text-gray-400">Loading subjects...</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {subjects?.map((subject, idx) => (
              <motion.div
                key={subject.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Link href={`/subject/${subject.id}`}>
                  <div className="group h-full cursor-pointer overflow-hidden rounded-2xl border border-white/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.05)] ring-1 ring-slate-200/60 transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(15,23,42,.1)]">
                    <div className="mb-6 flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <SubjectMark name={subject.name} size="lg"/>
                        <div><h3 className="text-xl font-semibold text-[#0B1F3A] transition-colors">
                          {subject.name}
                        </h3>
                        <span className="mt-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Syllabus {subject.code}</span></div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                        {subject.level === "O_LEVEL" ? "O Level" : "A Level"}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 p-3">
                      <div className="flex flex-col items-center gap-1 text-xs text-slate-500">
                        <FileText className="h-4 w-4" style={{ color: subject.color }} />
                        <b className="text-base text-[#0B1F3A]">{subject.totalPapers}</b><span>Papers</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 text-xs text-slate-500">
                        <HelpCircle className="h-4 w-4" style={{ color: subject.color }} />
                        <b className="text-base text-[#0B1F3A]">{subject.totalQuestions}</b><span>Questions</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 text-xs text-slate-500">
                        <PenLine className="h-4 w-4" style={{ color: subject.color }} />
                        <b className="text-base text-[#0B1F3A]">{subject.totalNotes}</b><span>Notes</span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm font-semibold text-teal-700"><span>Open study workspace</span><span className="transition group-hover:translate-x-1">→</span></div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
