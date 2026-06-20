import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboard } from "@/api/client";
import { Target, BookOpen, FileText, Clock } from "lucide-react";

export default function Progress() {
  const { data: dashboard, isLoading } = useGetDashboard();
  const statStyles = {
    teal: { bg: "bg-teal-50", text: "text-teal-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-500" },
    navy: { bg: "bg-slate-100", text: "text-[#0B1F3A]" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-500" },
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-[#0B1F3A] mb-2">Progress Tracker</h1>
          <p className="text-gray-500">See how you're doing across all your subjects.</p>
        </header>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading progress...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Questions Done", value: dashboard?.questionsAttempted ?? 0, icon: Target, color: "teal" as const },
                { label: "Hours Studied", value: dashboard?.totalHoursStudied ?? 0, icon: Clock, color: "blue" as const },
                { label: "Subjects Active", value: dashboard?.subjectsEnrolled ?? 0, icon: BookOpen, color: "navy" as const },
                { label: "Overall Score", value: `${dashboard?.overallScore ?? 0}%`, icon: FileText, color: "cyan" as const },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border p-6 text-center shadow-sm">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${statStyles[stat.color].bg}`}>
                    <stat.icon className={`h-6 w-6 ${statStyles[stat.color].text}`} />
                  </div>
                  <div className="text-2xl font-bold text-[#0B1F3A] mb-1">{stat.value}</div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#0B1F3A]">Subject Breakdown</h2>
              {dashboard?.subjectProgress.map((sp) => (
                <div key={sp.subjectId} className="bg-white rounded-xl border p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sp.subjectColor }} />
                      <h3 className="font-bold text-[#0B1F3A]">{sp.subjectName}</h3>
                    </div>
                    <span className="text-sm font-bold text-[#0B1F3A]">{sp.percentComplete}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${sp.percentComplete}%`, backgroundColor: sp.subjectColor }}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-400">
                    <div><span className="font-semibold text-[#0B1F3A]">{sp.questionsAttempted}</span> Questions</div>
                    <div><span className="font-semibold text-[#0B1F3A]">{sp.questionsCorrect}</span> Correct</div>
                    <div><span className="font-semibold text-[#0B1F3A]">{sp.papersCompleted}</span> Papers</div>
                    <div><span className="font-semibold text-[#0B1F3A]">{sp.hoursStudied}h</span> Studied</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
