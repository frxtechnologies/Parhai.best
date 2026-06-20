import { useListSubjects, getListSubjectsQueryKey } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
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
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#0B1F3A] mb-2">Subjects</h1>
            <p className="text-gray-500">Browse materials and resources by subject.</p>
          </div>

          <div className="flex rounded-xl border bg-white p-1 gap-1 w-full md:w-auto">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  level === l
                    ? "bg-[#0B1F3A] text-white shadow-sm"
                    : "text-gray-500 hover:text-[#0B1F3A]"
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects?.map((subject, idx) => (
              <motion.div
                key={subject.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Link href={`/subject/${subject.id}`}>
                  <div
                    className="bg-white hover:shadow-lg transition-all cursor-pointer h-full border-t-4 overflow-hidden rounded-xl border group p-6"
                    style={{ borderTopColor: subject.color }}
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="font-bold text-xl text-[#0B1F3A] mb-1 group-hover:text-[#0B1F3A] transition-colors">
                          {subject.name}
                        </h3>
                        <span className="text-sm font-mono text-gray-400">{subject.code}</span>
                      </div>
                      <div className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-500">
                        {subject.level === "O_LEVEL" ? "O Level" : "A Level"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <FileText className="h-4 w-4" style={{ color: subject.color }} />
                        <span>{subject.totalPapers} Papers</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <HelpCircle className="h-4 w-4" style={{ color: subject.color }} />
                        <span>{subject.totalQuestions} Qs</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <PenLine className="h-4 w-4" style={{ color: subject.color }} />
                        <span>{subject.totalNotes} Notes</span>
                      </div>
                    </div>
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
