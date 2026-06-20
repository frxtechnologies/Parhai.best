import { AppLayout } from "@/components/layout/app-layout";
import { useListSubjects } from "@/api/client";
import { useAuth } from "@/context/auth-context";
import { Bot, BookOpen } from "lucide-react";
import { Link } from "wouter";

export default function AiTutor() {
  const { user } = useAuth();
  const { data: subjects = [], isLoading } = useListSubjects(user?.level ? { level: user.level } : undefined);
  const selectedSubjects = subjects.filter((subject) => user?.subjectIds.includes(subject.id));
  const visibleSubjects = selectedSubjects.length > 0 ? selectedSubjects : subjects;

  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
            <Bot className="h-4 w-4" />
            Subject-specific AI
          </div>
          <h1 className="text-3xl font-bold text-[#0B1F3A]">Choose a subject assistant</h1>
          <p className="mt-2 max-w-2xl text-gray-500">
            Each assistant searches the matching Supabase papers, questions, topics, and notes, then asks Gemini to answer only from those records.
          </p>
        </header>

        {isLoading ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-500">Loading subjects...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleSubjects.map((subject) => (
              <Link key={subject.id} href={`/subject/${subject.id}/ai`}>
                <div className="h-full rounded-2xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#0B1F3A]/30 hover:shadow-lg">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="rounded-xl bg-[#F8FAFC] p-3 text-[#0B1F3A]">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                      {subject.level === "O_LEVEL" ? "O Level" : "A Level"}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[#0B1F3A]">{subject.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">{subject.code}</p>
                  <p className="mt-4 text-sm text-gray-500">
                    Opens a scoped assistant for this subject only.
                  </p>
                </div>
              </Link>
            ))}
            {visibleSubjects.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border bg-white p-10 text-center text-sm text-gray-500">
                Select subjects during onboarding to open subject AI assistants.
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
