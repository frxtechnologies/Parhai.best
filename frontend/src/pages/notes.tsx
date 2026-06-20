import { AppLayout } from "@/components/layout/app-layout";
import { useListNotes, getListNotesQueryKey } from "@/api/client";
import { FilePenLine, Clock } from "lucide-react";

export default function Notes() {
  const { data: notes, isLoading } = useListNotes(
    {},
    { query: { queryKey: getListNotesQueryKey({}) } }
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-[#0B1F3A] mb-2">Revision Notes</h1>
          <p className="text-gray-500">Concise, syllabus-aligned study notes.</p>
        </header>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading notes...</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {notes?.map((note) => (
              <div
                key={note.id}
                className="bg-white rounded-xl border hover:shadow-md transition-shadow cursor-pointer group p-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-cyan-50 rounded-lg group-hover:bg-[#0B1F3A] group-hover:text-white transition-colors">
                    <FilePenLine className="h-5 w-5 text-[#0B1F3A] group-hover:text-white" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {note.subjectName}
                  </span>
                </div>

                <h3 className="font-bold text-lg text-[#0B1F3A] mb-2 line-clamp-2">{note.title}</h3>
                <p className="text-sm text-gray-400 mb-4 line-clamp-2">{note.summary}</p>

                <div className="flex items-center justify-between text-xs text-gray-400 border-t pt-4">
                  <span className="truncate max-w-[150px]">{note.topic}</span>
                  <span className="flex items-center gap-1 shrink-0 ml-2">
                    <Clock className="h-3 w-3" /> {note.readingTime} min
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
